import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderStatus } from "@/generated/prisma/enums";
import { draftWorkOrderFromReport } from "@/server/ai/service";
import { db } from "@/server/db";
import { createWorkOrder } from "@/server/work-orders/commands";
import { ctxFor, seedFixture, type Fixture } from "../support/fixtures";

let fixture: Fixture;
beforeEach(async () => {
  fixture = await seedFixture();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const REPORT = "The hallway light near room 204 keeps flickering and smells burnt. Call me on 07700 900123.";

function stubGemini(response: () => Promise<Response>) {
  const fetchMock = vi.fn(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AI drafting", () => {
  it("keeps the saved report and produces a labelled fallback when the provider is down", async () => {
    stubGemini(async () => {
      throw new TypeError("fetch failed");
    });
    const ctx = ctxFor(fixture.people.reporter);
    const created = await createWorkOrder(ctx, { originalReport: REPORT });
    const draft = await draftWorkOrderFromReport(ctx, created.id);

    expect(draft.status).toBe("FALLBACK");
    expect(draft.errorCode).toBe("PROVIDER_ERROR");
    expect(draft.suggestion.signals.map((signal) => signal.factor)).toContain("SAFETY_RISK");
    const row = await db.workOrder.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.originalReport).toBe(REPORT);
    expect(row.status).toBe(WorkOrderStatus.SUBMITTED);
    const stored = await db.aiExtraction.findFirstOrThrow({ where: { workOrderId: created.id } });
    expect(stored).toMatchObject({ status: "FALLBACK", provider: "gemini", errorCode: "PROVIDER_ERROR", schemaVersion: "v1" });
  });

  it("sends only redacted text and stores a validated suggestion without touching the work order", async () => {
    const fetchMock = stubGemini(async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    suggestedTitle: "Flickering hallway light with burning smell",
                    summary: "Light near room 204 flickers and smells burnt.",
                    category: "electrical",
                    suggestedPriority: "URGENT",
                    signals: [{ factor: "SAFETY_RISK", evidence: "smells burnt" }],
                    missingDetails: [],
                    suggestedNextStep: "Coordinator to review the safety flag.",
                    confidence: 70,
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    const ctx = ctxFor(fixture.people.reporter);
    const created = await createWorkOrder(ctx, { originalReport: REPORT });
    const draft = await draftWorkOrderFromReport(ctx, created.id);

    expect(draft.status).toBe("SUCCEEDED");
    expect(draft.suggestion.categorySlug).toBe("electrical");
    const sentBody = String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(sentBody).not.toContain("07700 900123");
    expect(sentBody).toContain("[phone removed]");
    expect(sentBody).not.toContain(fixture.people.reporter.id);

    const row = await db.workOrder.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.title).not.toBe("Flickering hallway light with burning smell");
    expect(row.categoryId).toBeNull();
  });

  it("refuses to draft for someone who can't edit the report", async () => {
    stubGemini(async () => Response.json({}));
    const created = await createWorkOrder(ctxFor(fixture.people.reporter), { originalReport: REPORT });
    await expect(draftWorkOrderFromReport(ctxFor(fixture.people.otherReporter), created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(draftWorkOrderFromReport(ctxFor(fixture.people.tech), created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.aiExtraction.count()).toBe(0);
  });
});
