import { describe, expect, it, vi } from "vitest";
import { Priority } from "@/generated/prisma/enums";
import { ruleBasedExtraction } from "@/server/ai/fallback";
import { extractJsonObject, toSuggestion } from "@/server/ai/output";
import { createGeminiProvider, createGroqProvider } from "@/server/ai/providers";
import { redactContactDetails } from "@/server/ai/redact";
import { runExtraction, selectProvider } from "@/server/ai/run-extraction";
import type { ExtractionInput } from "@/server/ai/types";

const CATEGORIES = [
  { slug: "electrical", name: "Electrical" },
  { slug: "plumbing", name: "Plumbing" },
];

const DEMO_REPORT = "The hallway light near room 204 keeps flickering and smells burnt.";
const input: ExtractionInput = { report: DEMO_REPORT, locationLabel: null, assetLabel: null, categories: CATEGORIES };

const validOutput = {
  suggestedTitle: "Flickering hallway light near room 204 with burning smell",
  summary: "Hallway light near room 204 flickers repeatedly and gives off a burnt smell.",
  category: "electrical",
  suggestedPriority: "URGENT",
  signals: [
    { factor: "SAFETY_RISK", evidence: "smells burnt" },
    { factor: "WORSENING", evidence: "keeps flickering" },
  ],
  missingDetails: ["Is the light still switched on?"],
  suggestedNextStep: "Coordinator to review the safety flag before assigning an electrician.",
  confidence: 72,
};

function geminiFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

const geminiReply = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

describe("redaction", () => {
  it("removes emails and phone numbers but keeps room numbers", () => {
    const text = "Call me on +44 7700 900123 or mail jordan.ellis@example.test — it's room 204, desk 14.";
    const redacted = redactContactDetails(text);
    expect(redacted).not.toContain("7700");
    expect(redacted).not.toContain("jordan.ellis@example.test");
    expect(redacted).toContain("room 204, desk 14");
  });
});

describe("rule-based fallback", () => {
  it("drafts the demo report with quoted evidence", () => {
    const draft = ruleBasedExtraction(input);
    expect(draft.categorySlug).toBe("electrical");
    expect(draft.suggestedPriority).toBe(Priority.URGENT);
    expect(draft.signals).toEqual([
      { factor: "SAFETY_RISK", evidence: "smells burnt" },
      { factor: "WORSENING", evidence: "keeps flickering" },
    ]);
    expect(draft.confidence).toBeNull();
    for (const signal of draft.signals) expect(DEMO_REPORT).toContain(signal.evidence);
  });

  it("asks for details the report doesn't give", () => {
    const draft = ruleBasedExtraction({ ...input, report: "Something is making a noise." });
    expect(draft.missingDetails).toContain("Where exactly is this (building, floor, room)?");
    expect(draft.signals).toHaveLength(0);
    expect(draft.categorySlug).toBeNull();
  });
});

describe("model output handling", () => {
  it("finds JSON inside markdown fences and prose", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Here you go: {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("{broken")).toBeNull();
  });

  it("drops signals whose evidence is not in the report", () => {
    const suggestion = toSuggestion(
      { ...validOutput, signals: [...validOutput.signals, { factor: "MULTIPLE_PEOPLE_AFFECTED", evidence: "the whole floor is dark" }] },
      DEMO_REPORT,
      CATEGORIES,
    );
    expect(suggestion?.signals.map((signal) => signal.factor)).toEqual(["SAFETY_RISK", "WORSENING"]);
  });

  it("nulls categories outside the workspace", () => {
    expect(toSuggestion({ ...validOutput, category: "roofing" }, DEMO_REPORT, CATEGORIES)?.categorySlug).toBeNull();
    expect(toSuggestion({ ...validOutput, category: "unknown" }, DEMO_REPORT, CATEGORIES)?.categorySlug).toBeNull();
  });

  it("rejects malformed, oversized or extra-key output", () => {
    expect(toSuggestion({ ...validOutput, suggestedPriority: "CRITICAL" }, DEMO_REPORT, CATEGORIES)).toBeNull();
    expect(toSuggestion({ ...validOutput, suggestedTitle: "x".repeat(101) }, DEMO_REPORT, CATEGORIES)).toBeNull();
    expect(toSuggestion({ ...validOutput, assigneeId: "u_tech1" }, DEMO_REPORT, CATEGORIES)).toBeNull();
    expect(toSuggestion({ ...validOutput, signals: [{ factor: "CEO_ASKED", evidence: "x" }] }, DEMO_REPORT, CATEGORIES)).toBeNull();
    expect(toSuggestion(null, DEMO_REPORT, CATEGORIES)).toBeNull();
  });
});

describe("runExtraction", () => {
  const fast = { timeoutMs: 200, retryDelayMs: 1 };

  it("uses a valid model answer", async () => {
    const provider = createGeminiProvider("key", "gemini-test", geminiFetch(geminiReply(JSON.stringify(validOutput))));
    const run = await runExtraction(input, { provider }, fast);
    expect(run).toMatchObject({ status: "SUCCEEDED", provider: "gemini", model: "gemini-test", errorCode: null });
    expect(run.suggestion.confidence).toBe(72);
  });

  it("falls back on malformed output without retrying", async () => {
    const fetcher = geminiFetch(geminiReply("Sure! The issue is a light."));
    const run = await runExtraction(input, { provider: createGeminiProvider("key", "m", fetcher) }, fast);
    expect(run).toMatchObject({ status: "FALLBACK", errorCode: "INVALID_OUTPUT" });
    expect(run.suggestion.signals.length).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry a rate limit", async () => {
    const fetcher = geminiFetch({ error: "quota" }, 429);
    const run = await runExtraction(input, { provider: createGeminiProvider("key", "m", fetcher) }, fast);
    expect(run).toMatchObject({ status: "FALLBACK", errorCode: "RATE_LIMITED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a server error once, then falls back", async () => {
    const fetcher = geminiFetch({ error: "boom" }, 503);
    const run = await runExtraction(input, { provider: createGeminiProvider("key", "m", fetcher) }, fast);
    expect(run).toMatchObject({ status: "FALLBACK", errorCode: "PROVIDER_ERROR" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("times out a hanging provider and falls back", async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const run = await runExtraction(input, { provider: createGroqProvider("key", "m", hanging) }, { timeoutMs: 50, retryDelayMs: 1 });
    expect(run).toMatchObject({ status: "FALLBACK", errorCode: "TIMEOUT", provider: "groq" });
    expect(hanging).toHaveBeenCalledTimes(2);
  });

  it("uses the rule-based draft when no key is configured", async () => {
    const selection = selectProvider({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: undefined,
      GEMINI_MODEL: "m",
      GROQ_API_KEY: undefined,
      GROQ_MODEL: "m",
    });
    expect(selection.provider).toBeNull();
    const run = await runExtraction(input, selection, fast);
    expect(run).toMatchObject({ status: "FALLBACK", provider: "rules", model: "keyword-rules-v1", errorCode: "NO_KEY" });
  });

  it("parses Groq's OpenAI-compatible response", async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(validOutput) } }] }));
    const run = await runExtraction(input, { provider: createGroqProvider("key", "openai/gpt-oss-20b", fetcher) }, fast);
    expect(run.status).toBe("SUCCEEDED");
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).response_format.type).toBe("json_schema");
  });
});
