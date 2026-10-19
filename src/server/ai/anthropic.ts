import Anthropic from "@anthropic-ai/sdk";
import type { FetchLike } from "./providers";
import { withOutputModes, withSchemaInstruction } from "./providers";
import { ProviderFailure, type JsonCompleter, type JsonRequest } from "./types";

/** Models that accept the server-side refusal fallback ("fallbacks": "default"). */
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

// Constraints structured outputs don't enforce. Replies are validated with Zod afterwards anyway.
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  "maxLength",
  "minLength",
  "maximum",
  "minimum",
  "maxItems",
  "exclusiveMaximum",
  "exclusiveMinimum",
]);

function structuredSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(structuredSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYS.has(key))
      .map(([key, value]) => [key, structuredSchema(value)]),
  );
}

interface ClaudeMode {
  /** Structured outputs plus low effort; short JSON tasks don't need deep thinking. */
  structured: boolean;
  effort: boolean;
}
const CLAUDE_MODES: readonly ClaudeMode[] = [
  { structured: true, effort: true },
  { structured: true, effort: false },
  { structured: false, effort: false },
];

/** SDK errors to our failure codes; the API's own message is never passed on. */
export function toProviderFailure(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new ProviderFailure("TIMEOUT", true, "request timed out");
  }
  if (error instanceof Anthropic.APIConnectionError) return new ProviderFailure("PROVIDER_ERROR", true, "network error");
  if (error instanceof Anthropic.RateLimitError) return new ProviderFailure("RATE_LIMITED", false, "rate limited", 429);
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : null;
    // 529 is "overloaded": temporary, like a 5xx.
    const retryable = status !== null && status >= 500;
    return new ProviderFailure("PROVIDER_ERROR", retryable, `upstream ${status ?? "error"}`, status);
  }
  return new ProviderFailure("PROVIDER_ERROR", false, "unexpected error");
}

export function anthropicClient(apiKey: string, fetcher: FetchLike = fetch) {
  // Retries are ours (run-extraction and the assistant engine), so the SDK makes one attempt.
  return new Anthropic({ apiKey, fetch: fetcher, maxRetries: 0 });
}

export function createAnthropicCompleter(apiKey: string, model: string, fetcher: FetchLike = fetch): JsonCompleter {
  const client = anthropicClient(apiKey, fetcher);
  const serverFallback = SERVER_FALLBACK_MODELS.has(model);
  return {
    name: "anthropic",
    model,
    complete(request: JsonRequest) {
      return withOutputModes(`anthropic|${model}`, CLAUDE_MODES, async (mode) => {
        let response: Anthropic.Beta.BetaMessage;
        try {
          response = await client.beta.messages.create(
            {
              model,
              max_tokens: 16000,
              system: mode.structured ? request.system : withSchemaInstruction(request.system, request.jsonSchema),
              messages: request.turns.map((turn) => ({ role: turn.role === "model" ? "assistant" : "user", content: turn.text })),
              ...(mode.structured
                ? {
                    output_config: {
                      format: { type: "json_schema", schema: structuredSchema(request.jsonSchema) as Record<string, unknown> },
                      ...(mode.effort ? { effort: "low" } : {}),
                    },
                  }
                : {}),
              ...(serverFallback && mode.structured ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
            },
            { signal: request.signal },
          );
        } catch (error) {
          throw toProviderFailure(error);
        }
        if (response.stop_reason === "refusal") throw new ProviderFailure("PROVIDER_ERROR", false, "model declined");
        return response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      });
    },
  };
}
