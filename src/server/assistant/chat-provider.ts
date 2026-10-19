import { ASSISTANT_TOOLS, PROPOSAL_ACTIONS } from "@/domain/assistant";
import type { ServerEnv } from "../env";
import {
  GROQ_BASE_URL,
  createGeminiCompleter,
  createOpenAiCompatibleCompleter,
  type FetchLike,
  type OpenAiCompatibleConfig,
} from "../ai/providers";
import type { ChatTurn, JsonCompleter } from "../ai/types";

export type { ChatTurn };

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

/** The assistant's step protocol on top of any completer. */
export function chatProviderFrom(completer: JsonCompleter): ChatProvider {
  return {
    name: completer.name,
    model: completer.model,
    complete(system, turns, signal) {
      return completer.complete({
        system,
        turns,
        schemaName: "assistant_step",
        jsonSchema: stepJsonSchema(),
        geminiSchema: stepGeminiSchema(),
        temperature: 0.4,
        signal,
      });
    },
  };
}

export function createGeminiChat(apiKey: string, model: string, fetcher: FetchLike = fetch): ChatProvider {
  return chatProviderFrom(createGeminiCompleter(apiKey, model, fetcher));
}

export function createOpenAiCompatibleChat(config: OpenAiCompatibleConfig, fetcher: FetchLike = fetch): ChatProvider {
  return chatProviderFrom(createOpenAiCompatibleCompleter(config, fetcher));
}

export function createGroqChat(apiKey: string, model: string, fetcher: FetchLike = fetch): ChatProvider {
  return createOpenAiCompatibleChat({ name: "groq", apiKey, model, baseUrl: GROQ_BASE_URL }, fetcher);
}

/** Uses the same provider switch as report drafting. Null means the assistant is unavailable. */
export function selectChatProvider(
  env: Pick<ServerEnv, "AI_PROVIDER" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "GROQ_API_KEY" | "GROQ_MODEL">,
): ChatProvider | null {
  if (env.AI_PROVIDER === "gemini" && env.GEMINI_API_KEY) return createGeminiChat(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  if (env.AI_PROVIDER === "groq" && env.GROQ_API_KEY) return createGroqChat(env.GROQ_API_KEY, env.GROQ_MODEL);
  return null;
}
