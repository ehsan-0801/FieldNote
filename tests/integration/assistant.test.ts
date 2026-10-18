import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import type { AssistantStep } from "@/domain/assistant";
import { DomainError } from "@/domain/errors";
import { decideAssistantAction, getConversation, sendAssistantMessage } from "@/server/assistant/service";
import { db } from "@/server/db";
import { ctxFor, seedFixture, workOrderFor, type Fixture } from "../support/fixtures";

let fixture: Fixture;
beforeEach(async () => {
  fixture = await seedFixture();
});
afterEach(() => vi.unstubAllGlobals());

const NO_PROPOSAL: AssistantStep["proposal"] = { action: "none", reference: "", technicianName: "", toStatus: "", text: "", location: "" };
const step = (overrides: Partial<AssistantStep>): AssistantStep => ({
  step: "answer",
  tool: "none",
  query: "",
  reference: "",
  status: "",
  reply: "",
  proposal: NO_PROPOSAL,
  ...overrides,
});

/** Stubs the Gemini endpoint with scripted steps and records every request body. */
function scriptModel(steps: AssistantStep[]) {
  const bodies: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      const next = steps.shift() ?? step({ reply: "(script exhausted)" });
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(next) }] } }] });
    }),
  );
  return bodies;
}

type Person = Fixture["people"][keyof Fixture["people"]];
const chatCtx = (person: Person) => ({ ...ctxFor(person), user: { name: person.name, role: person.role, workspaceName: "Northgate" } });

async function expectCode(promise: Promise<unknown>, code: DomainError["code"]) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof DomainError && error.code === code);
}

describe("assistant lookups respect access", () => {
  it("never passes another reporter's work order to the model", async () => {
    const theirs = await workOrderFor(fixture, { reference: "WO-2001" });
    const bodies = scriptModel([
      step({ step: "tool", tool: "get_work_order", reference: "WO-2001" }),
      step({ reply: "I can’t find WO-2001." }),
    ]);

    const conversation = await sendAssistantMessage(chatCtx(fixture.people.otherReporter), { content: "What's happening on WO-2001?" });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toContain("No work order with that reference");
    expect(bodies.join("")).not.toContain(theirs.originalReport.slice(0, 30));
    const reply = conversation.messages.at(-1);
    expect(reply?.links).toEqual([]);
  });

  it("gives the model only what the coordinator can see, with contact details removed", async () => {
    const order = await workOrderFor(fixture, { reference: "WO-2002" });
    await db.workOrder.update({ where: { id: order.id }, data: { originalReport: "Light flickers. Call me on 07700 900123." } });
    const bodies = scriptModel([
      step({ step: "tool", tool: "get_work_order", reference: "wo-2002" }),
      step({ reply: "WO-2002 is in progress." }),
    ]);

    const conversation = await sendAssistantMessage(chatCtx(fixture.people.coordinator), { content: "Status of WO-2002?" });
    expect(bodies[1]).toContain("Light flickers");
    expect(bodies[1]).not.toContain("07700 900123");
    expect(conversation.messages.at(-1)?.links).toEqual([{ reference: "WO-2002", workOrderId: order.id }]);
  });
});

describe("suggested actions", () => {
  it("does not offer assignment to a technician", async () => {
    await workOrderFor(fixture, { reference: "WO-2003" });
    scriptModel([
      step({ reply: "Prepared.", proposal: { ...NO_PROPOSAL, action: "assign", reference: "WO-2003", technicianName: "othertech" } }),
    ]);
    const conversation = await sendAssistantMessage(chatCtx(fixture.people.tech), { content: "Give WO-2003 to othertech" });
    const reply = conversation.messages.at(-1);
    expect(reply?.proposal).toBeNull();
    expect(reply?.notice).toMatch(/Only coordinators and administrators/);
  });

  it("runs a confirmed assignment through the normal service, once", async () => {
    const order = await workOrderFor(fixture, { reference: "WO-2004", status: WorkOrderStatus.TRIAGE, assigneeId: null });
    scriptModel([
      step({
        reply: "You can confirm below.",
        proposal: { ...NO_PROPOSAL, action: "assign", reference: "WO-2004", technicianName: "tech" },
      }),
    ]);
    const ctx = chatCtx(fixture.people.coordinator);
    const conversation = await sendAssistantMessage(ctx, { content: "Assign WO-2004 to tech" });
    const reply = conversation.messages.at(-1);
    expect(reply?.proposal).toMatchObject({ type: "assign", assigneeId: fixture.people.tech.id });
    expect(reply?.actionStatus).toBe("PENDING");
    expect((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).assigneeId).toBeNull();

    const after = await decideAssistantAction(ctx, reply!.id, "confirm");
    expect(after.messages.at(-1)?.actionStatus).toBe("CONFIRMED");
    expect((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).assigneeId).toBe(fixture.people.tech.id);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: order.id, action: "work_order.assigned" } });
    expect(audit.actorId).toBe(fixture.people.coordinator.id);

    await expectCode(decideAssistantAction(ctx, reply!.id, "confirm"), "CONFLICT");
  });

  it("refuses to offer a resolution without a note", async () => {
    await workOrderFor(fixture, { reference: "WO-2005" });
    scriptModel([
      step({ reply: "Ready.", proposal: { ...NO_PROPOSAL, action: "change_status", reference: "WO-2005", toStatus: "RESOLVED" } }),
    ]);
    const conversation = await sendAssistantMessage(chatCtx(fixture.people.tech), { content: "Mark WO-2005 resolved" });
    expect(conversation.messages.at(-1)?.notice).toMatch(/resolution note/);
  });

  it("records a failed confirmation when permissions changed in the meantime", async () => {
    const order = await workOrderFor(fixture, { reference: "WO-2006" });
    scriptModel([
      step({ reply: "Confirm below.", proposal: { ...NO_PROPOSAL, action: "add_note", reference: "WO-2006", text: "Parts ordered." } }),
    ]);
    const ctx = chatCtx(fixture.people.tech);
    const conversation = await sendAssistantMessage(ctx, { content: "Note that parts are ordered on WO-2006" });
    await db.workOrder.update({ where: { id: order.id }, data: { assigneeId: fixture.people.otherTech.id } });

    const after = await decideAssistantAction(ctx, conversation.messages.at(-1)!.id, "confirm");
    expect(after.messages.at(-1)).toMatchObject({ actionStatus: "FAILED" });
    expect(await db.workOrderNote.count({ where: { workOrderId: order.id } })).toBe(0);
  });

  it("files a report from chat as the person, ready for review", async () => {
    scriptModel([
      step({
        reply: "I’ve drafted it; confirm to file.",
        proposal: {
          ...NO_PROPOSAL,
          action: "create_report",
          text: "The lift on level 2 keeps stopping between floors.",
          location: "Lift B",
        },
      }),
    ]);
    const ctx = chatCtx(fixture.people.reporter);
    const conversation = await sendAssistantMessage(ctx, { content: "The lift keeps stopping" });
    const after = await decideAssistantAction(ctx, conversation.messages.at(-1)!.id, "confirm");
    const link = after.messages.at(-1)?.links[0];
    const created = await db.workOrder.findUniqueOrThrow({ where: { id: link!.workOrderId } });
    expect(created).toMatchObject({ reporterId: fixture.people.reporter.id, status: "SUBMITTED", locationLabel: "Lift B" });
  });
});

describe("conversation privacy", () => {
  it("keeps conversations and their suggestions private to the owner", async () => {
    await workOrderFor(fixture, { reference: "WO-2007" });
    scriptModel([
      step({ reply: "Confirm below.", proposal: { ...NO_PROPOSAL, action: "add_note", reference: "WO-2007", text: "Checked." } }),
    ]);
    const conversation = await sendAssistantMessage(chatCtx(fixture.people.admin), { content: "Note on WO-2007" });
    const intruder = chatCtx(fixture.people.coordinator);
    await expectCode(getConversation(intruder.actor, conversation.id), "NOT_FOUND");
    await expectCode(decideAssistantAction(intruder, conversation.messages.at(-1)!.id, "confirm"), "NOT_FOUND");
    await expectCode(sendAssistantMessage(intruder, { conversationId: conversation.id, content: "hi" }), "NOT_FOUND");
    expect(fixture.people.coordinator.role).toBe(Role.COORDINATOR);
  });
});
