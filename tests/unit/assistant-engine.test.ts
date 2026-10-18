import { describe, expect, it, vi } from "vitest";
import type { AssistantStep } from "@/domain/assistant";
import { ProviderFailure } from "@/server/ai/types";
import { createGeminiChat, createGroqChat, selectChatProvider, type ChatProvider, type ChatTurn } from "@/server/assistant/chat-provider";
import { runAssistantTurn } from "@/server/assistant/engine";

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

/** A provider that replays scripted outputs and records what it was sent. */
function scripted(outputs: (string | Error)[]) {
  const calls: ChatTurn[][] = [];
  const provider: ChatProvider = {
    name: "fake",
    model: "fake-1",
    complete: vi.fn(async (_system: string, turns: readonly ChatTurn[]) => {
      calls.push([...turns]);
      const next = outputs.shift();
      if (next === undefined) throw new Error("script exhausted");
      if (next instanceof Error) throw next;
      return next;
    }),
  };
  return { provider, calls };
}

const base = { system: "test", history: [{ role: "user" as const, text: "What's on WO-1008?" }], timeoutMs: 1000 };

describe("runAssistantTurn", () => {
  it("runs a lookup and passes the result back before answering", async () => {
    const { provider, calls } = scripted([
      JSON.stringify(step({ step: "tool", tool: "get_work_order", reference: "WO-1008" })),
      JSON.stringify(step({ reply: "WO-1008 is in triage." })),
    ]);
    const runTool = vi.fn(async () => '{"reference":"WO-1008","status":"TRIAGE"}');
    const result = await runAssistantTurn({ ...base, provider, runTool });
    expect(result).toMatchObject({ ok: true, toolCalls: ["get_work_order"], step: { reply: "WO-1008 is in triage." } });
    expect(runTool).toHaveBeenCalledWith(expect.objectContaining({ tool: "get_work_order", reference: "WO-1008" }));
    expect(calls[1].at(-1)?.text).toContain("TOOL RESULT (get_work_order)");
  });

  it("asks once for a correctly formatted reply, then gives up", async () => {
    const recovered = scripted(["not json", JSON.stringify(step({ reply: "Fine." }))]);
    expect(await runAssistantTurn({ ...base, provider: recovered.provider, runTool: vi.fn() })).toMatchObject({ ok: true });

    const broken = scripted(["not json", '{"step":"answer"}']);
    expect(await runAssistantTurn({ ...base, provider: broken.provider, runTool: vi.fn() })).toMatchObject({
      ok: false,
      reason: "INVALID_OUTPUT",
    });
  });

  it("retries one transient failure but not a rate limit", async () => {
    const transient = scripted([new ProviderFailure("TIMEOUT", true, "slow"), JSON.stringify(step({ reply: "Hi." }))]);
    expect(await runAssistantTurn({ ...base, provider: transient.provider, runTool: vi.fn() })).toMatchObject({ ok: true });

    const limited = scripted([new ProviderFailure("RATE_LIMITED", false, "429"), JSON.stringify(step({ reply: "Hi." }))]);
    expect(await runAssistantTurn({ ...base, provider: limited.provider, runTool: vi.fn() })).toMatchObject({
      ok: false,
      reason: "RATE_LIMITED",
    });
    expect(limited.provider.complete).toHaveBeenCalledTimes(1);
  });

  it("bounds a model that keeps calling tools", async () => {
    const looping = scripted(Array.from({ length: 10 }, () => JSON.stringify(step({ step: "tool", tool: "get_overview" }))));
    const runTool = vi.fn(async () => "{}");
    const result = await runAssistantTurn({ ...base, provider: looping.provider, runTool, maxCalls: 4 });
    expect(result.ok).toBe(false);
    expect(looping.provider.complete).toHaveBeenCalledTimes(4);
    expect(looping.calls.at(-1)?.at(-1)?.text).toContain("Do not call another tool");
  });

  it("rejects extra keys such as an attempted direct action", async () => {
    const sneaky = scripted([
      JSON.stringify({ ...step({ reply: "Done" }), execute: "assign" }),
      JSON.stringify({ ...step({ reply: "Done" }), execute: "assign" }),
    ]);
    expect(await runAssistantTurn({ ...base, provider: sneaky.provider, runTool: vi.fn() })).toMatchObject({ ok: false });
  });
});

describe("chat adapters", () => {
  it("sends strict JSON-schema requests to Groq with mapped roles", async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(step({ reply: "Hi" })) } }] }));
    await createGroqChat("key", "openai/gpt-oss-20b", fetcher).complete(
      "sys",
      [
        { role: "user", text: "a" },
        { role: "model", text: "b" },
      ],
      AbortSignal.timeout(1000),
    );
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user", "assistant"]);
  });

  it("sends Gemini a response schema and user/model turns", async () => {
    const fetcher = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
    await createGeminiChat("key", "gemini-test", fetcher).complete("sys", [{ role: "user", text: "a" }], AbortSignal.timeout(1000));
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.generationConfig.responseSchema.properties.proposal.properties.action.enum).toContain("assign");
    expect(body.contents[0].role).toBe("user");
  });

  it("is unavailable without a key or when AI is turned off", () => {
    const env = { GEMINI_MODEL: "m", GROQ_MODEL: "m", GEMINI_API_KEY: undefined, GROQ_API_KEY: undefined };
    expect(selectChatProvider({ ...env, AI_PROVIDER: "gemini" })).toBeNull();
    expect(selectChatProvider({ ...env, AI_PROVIDER: "none", GEMINI_API_KEY: "k" })).toBeNull();
    expect(selectChatProvider({ ...env, AI_PROVIDER: "groq", GROQ_API_KEY: "k" })?.name).toBe("groq");
  });
});
