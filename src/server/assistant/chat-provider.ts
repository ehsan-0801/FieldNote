import { z } from "zod";
import { ASSISTANT_TOOLS, PROPOSAL_ACTIONS } from "@/domain/assistant";
import type { ServerEnv } from "../env";
import { postJson, type FetchLike } from "../ai/providers";
import { ProviderFailure } from "../ai/types";

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** Multi-turn JSON completion. Parsing and validation of the returned text happen in the engine. */
export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  complete(system: string, turns: readonly ChatTurn[], signal: AbortSignal): Promise<string>;
}

const PROPOSAL_FIELDS = ["action", "reference", "technicianName", "toStatus", "text", "location"] as const;
const STEP_FIELDS = ["step", "tool", "query", "reference", "status", "reply", "proposal"] as const;

function stepJsonSchema() {
  const str = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: [...STEP_FIELDS],
    properties: {
      step: { type: "string", enum: ["tool", "answer"] },
      tool: { type: "string", enum: [...ASSISTANT_TOOLS] },
      query: str,
      reference: str,
      status: str,
      reply: str,
      proposal: {
        type: "object",
        additionalProperties: false,
        required: [...PROPOSAL_FIELDS],
        properties: {
          action: { type: "string", enum: [...PROPOSAL_ACTIONS] },
          reference: str,
          technicianName: str,
          toStatus: str,
          text: str,
          location: str,
        },
      },
    },
  };
}

function stepGeminiSchema() {
  const str = { type: "STRING" };
  return {
    type: "OBJECT",
    required: [...STEP_FIELDS],
    properties: {
      step: { type: "STRING", enum: ["tool", "answer"] },
      tool: { type: "STRING", enum: [...ASSISTANT_TOOLS] },
      query: str,
      reference: str,
      status: str,
      reply: str,
      proposal: {
        type: "OBJECT",
        required: [...PROPOSAL_FIELDS],
        properties: {
          action: { type: "STRING", enum: [...PROPOSAL_ACTIONS] },
          reference: str,
          technicianName: str,
          toStatus: str,
          text: str,
          location: str,
        },
      },
    },
  };
}

const geminiResponse = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })).min(1),
});

export function createGeminiChat(apiKey: string, model: string, fetcher: FetchLike = fetch): ChatProvider {
  return {
    name: "gemini",
    model,
    async complete(system, turns, signal) {
      const json = await postJson(
        fetcher,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": apiKey },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
          generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema: stepGeminiSchema() },
        },
        signal,
      );
      const parsed = geminiResponse.safeParse(json);
      if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected response shape");
      return parsed.data.candidates[0].content.parts.map((part) => part.text ?? "").join("");
    },
  };
}

const groqResponse = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1) });

export function createGroqChat(apiKey: string, model: string, fetcher: FetchLike = fetch): ChatProvider {
  return {
    name: "groq",
    model,
    async complete(system, turns, signal) {
      const json = await postJson(
        fetcher,
        "https://api.groq.com/openai/v1/chat/completions",
        { authorization: `Bearer ${apiKey}` },
        {
          model,
          temperature: 0.4,
          messages: [
            { role: "system", content: system },
            ...turns.map((turn) => ({ role: turn.role === "model" ? "assistant" : "user", content: turn.text })),
          ],
          response_format: { type: "json_schema", json_schema: { name: "assistant_step", strict: true, schema: stepJsonSchema() } },
        },
        signal,
      );
      const parsed = groqResponse.safeParse(json);
      if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected response shape");
      return parsed.data.choices[0].message.content ?? "";
    },
  };
}

/** Uses the same provider switch as report drafting. Null means the assistant is unavailable. */
export function selectChatProvider(
  env: Pick<ServerEnv, "AI_PROVIDER" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "GROQ_API_KEY" | "GROQ_MODEL">,
): ChatProvider | null {
  if (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) return createGeminiChat(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  if (env.AI_PROVIDER === "groq" && env.GROQ_API_KEY) return createGroqChat(env.GROQ_API_KEY, env.GROQ_MODEL);
  return null;
}
