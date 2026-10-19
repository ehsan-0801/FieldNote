import { z } from "zod";
import { SYSTEM_INSTRUCTION, buildUserPrompt, extractionJsonSchema, geminiResponseSchema } from "./prompt";
import { ProviderFailure, type ExtractionInput, type JsonCompleter, type JsonRequest, type ReportExtractionProvider } from "./types";

export type FetchLike = typeof fetch;

const INVALID_KEY_MARKER = /API_KEY_INVALID|api key not valid|invalid[ _]api[ _]key/i;

/** Maps HTTP outcomes to failure codes; provider bodies are never forwarded to users. */
export async function requestJson(
  fetcher: FetchLike,
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown },
  signal: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: init.method,
      headers: init.body === undefined ? init.headers : { "content-type": "application/json", ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ProviderFailure("TIMEOUT", true, "request timed out");
    }
    throw new ProviderFailure("PROVIDER_ERROR", true, "network error");
  }
  if (response.status === 429) throw new ProviderFailure("RATE_LIMITED", false, "rate limited", 429);
  if (response.status >= 500) throw new ProviderFailure("PROVIDER_ERROR", true, `upstream ${response.status}`, response.status);
  if (!response.ok) {
    // Google answers an invalid key with 400 API_KEY_INVALID, not 401; report it as a rejected key.
    // The body is only matched, never kept or forwarded.
    if (response.status === 400 && INVALID_KEY_MARKER.test((await response.text().catch(() => "")).slice(0, 4000))) {
      throw new ProviderFailure("PROVIDER_ERROR", false, "key rejected", 401);
    }
    throw new ProviderFailure("PROVIDER_ERROR", false, `upstream ${response.status}`, response.status);
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderFailure("PROVIDER_ERROR", false, "response was not JSON");
  }
}

export function postJson(fetcher: FetchLike, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  return requestJson(fetcher, url, { method: "POST", headers, body }, signal);
}

/** A 400 or 422 usually means "this model doesn't take that option", which a plainer request avoids. */
function isUnsupportedRequest(error: unknown): boolean {
  return error instanceof ProviderFailure && (error.httpStatus === 400 || error.httpStatus === 422);
}

const workingMode = new Map<string, number>();

/**
 * Tries each request shape in order, from the strictest output control to a plain prompt,
 * and remembers per model which one worked so later calls go straight to it.
 */
export async function withOutputModes<Mode>(cacheKey: string, modes: readonly Mode[], attempt: (mode: Mode) => Promise<string>) {
  for (let index = workingMode.get(cacheKey) ?? 0; ; index++) {
    try {
      const text = await attempt(modes[index]);
      if (workingMode.size > 500) workingMode.clear();
      workingMode.set(cacheKey, index);
      return text;
    } catch (error) {
      if (!isUnsupportedRequest(error) || index >= modes.length - 1) throw error;
    }
  }
}

/** For models that can't be held to a schema: the schema goes into the instructions instead. */
export function withSchemaInstruction(system: string, schema: Record<string, unknown>): string {
  return `${system}\n\nReply with only one JSON object and no other text. It must match this JSON Schema:\n${JSON.stringify(schema)}`;
}

const geminiResponse = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })).min(1),
});

type GeminiMode = "schema" | "json" | "plain";
const GEMINI_MODES: readonly GeminiMode[] = ["schema", "json", "plain"];

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function createGeminiCompleter(apiKey: string, model: string, fetcher: FetchLike = fetch): JsonCompleter {
  return {
    name: "gemini",
    model,
    complete(request: JsonRequest) {
      return withOutputModes(`gemini|${model}`, GEMINI_MODES, async (mode) => {
        const system = mode === "schema" ? request.system : withSchemaInstruction(request.system, request.jsonSchema);
        const json = await postJson(
          fetcher,
          `${GEMINI_BASE_URL}/models/${encodeURIComponent(model)}:generateContent`,
          { "x-goog-api-key": apiKey },
          {
            systemInstruction: { parts: [{ text: system }] },
            contents: request.turns.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
            generationConfig: {
              temperature: request.temperature,
              ...(mode === "plain" ? {} : { responseMimeType: "application/json" }),
              ...(mode === "schema" ? { responseSchema: request.geminiSchema } : {}),
            },
          },
          request.signal,
        );
        const parsed = geminiResponse.safeParse(json);
        if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected response shape");
        return parsed.data.candidates[0].content.parts.map((part) => part.text ?? "").join("");
      });
    },
  };
}

const chatCompletionResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** `${baseUrl}/chat/completions`, tolerating a trailing slash on the configured base URL. */
export function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export interface OpenAiCompatibleConfig {
  /** Recorded as the run's provider, e.g. "groq" or "openai_compatible". */
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface OpenAiMode {
  format: "json_schema" | "json_object" | "plain";
  /** Reasoning models only accept their default temperature. */
  temperature: boolean;
}
const OPENAI_MODES: readonly OpenAiMode[] = [
  { format: "json_schema", temperature: true },
  { format: "json_schema", temperature: false },
  { format: "json_object", temperature: false },
  { format: "plain", temperature: false },
];

/**
 * Any OpenAI-compatible chat completions API (OpenAI, Groq, OpenRouter, Mistral, DeepSeek,
 * Ollama...). Strict json_schema output is tried first; models without it get JSON mode,
 * then a plain prompt, and the reply is validated either way.
 */
export function createOpenAiCompatibleCompleter(config: OpenAiCompatibleConfig, fetcher: FetchLike = fetch): JsonCompleter {
  return {
    name: config.name,
    model: config.model,
    complete(request: JsonRequest) {
      return withOutputModes(`openai|${config.baseUrl}|${config.model}`, OPENAI_MODES, async (mode) => {
        const system = mode.format === "json_schema" ? request.system : withSchemaInstruction(request.system, request.jsonSchema);
        const json = await postJson(
          fetcher,
          chatCompletionsUrl(config.baseUrl),
          { authorization: `Bearer ${config.apiKey}` },
          {
            model: config.model,
            ...(mode.temperature ? { temperature: request.temperature } : {}),
            messages: [
              { role: "system", content: system },
              ...request.turns.map((turn) => ({ role: turn.role === "model" ? "assistant" : "user", content: turn.text })),
            ],
            ...(mode.format === "json_schema"
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
                  },
                }
              : mode.format === "json_object"
                ? { response_format: { type: "json_object" } }
                : {}),
          },
          request.signal,
        );
        const parsed = chatCompletionResponse.safeParse(json);
        if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected response shape");
        return parsed.data.choices[0].message.content ?? "";
      });
    },
  };
}

/** Report drafting on top of any completer. */
export function extractionProviderFrom(completer: JsonCompleter): ReportExtractionProvider {
  return {
    name: completer.name,
    model: completer.model,
    requestExtraction(input: ExtractionInput, signal: AbortSignal) {
      return completer.complete({
        system: SYSTEM_INSTRUCTION,
        turns: [{ role: "user", text: buildUserPrompt(input) }],
        schemaName: "work_order_draft",
        jsonSchema: extractionJsonSchema(input),
        geminiSchema: geminiResponseSchema(input),
        temperature: 0.2,
        signal,
      });
    },
  };
}

export function createGeminiProvider(apiKey: string, model: string, fetcher: FetchLike = fetch): ReportExtractionProvider {
  return extractionProviderFrom(createGeminiCompleter(apiKey, model, fetcher));
}

export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig, fetcher: FetchLike = fetch): ReportExtractionProvider {
  return extractionProviderFrom(createOpenAiCompatibleCompleter(config, fetcher));
}

export function createGroqProvider(apiKey: string, model: string, fetcher: FetchLike = fetch): ReportExtractionProvider {
  return createOpenAiCompatibleProvider({ name: "groq", apiKey, model, baseUrl: GROQ_BASE_URL }, fetcher);
}
