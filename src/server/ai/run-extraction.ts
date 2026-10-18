import type { AiErrorCode } from "@/domain/extraction";
import type { ServerEnv } from "../env";
import { FALLBACK_MODEL, FALLBACK_PROVIDER, ruleBasedExtraction } from "./fallback";
import { extractJsonObject, toSuggestion } from "./output";
import { createGeminiProvider, createGroqProvider } from "./providers";
import { ProviderFailure, type ExtractionInput, type ExtractionRun, type ReportExtractionProvider } from "./types";

export type ProviderSelection =
  { provider: ReportExtractionProvider } | { provider: null; reason: Extract<AiErrorCode, "NO_KEY" | "DISABLED"> };

export function selectProvider(
  env: Pick<ServerEnv, "AI_PROVIDER" | "GEMINI_API_KEY" | "GEMINI_MODEL" | "GROQ_API_KEY" | "GROQ_MODEL">,
): ProviderSelection {
  switch (env.AI_PROVIDER) {
    case "none":
      return { provider: null, reason: "DISABLED" };
    case "gemini":
      return env.GEMINI_API_KEY
        ? { provider: createGeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL) }
        : { provider: null, reason: "NO_KEY" };
    case "groq":
      return env.GROQ_API_KEY ? { provider: createGroqProvider(env.GROQ_API_KEY, env.GROQ_MODEL) } : { provider: null, reason: "NO_KEY" };
  }
}

export interface RunOptions {
  timeoutMs: number;
  /** Total attempts including the first; retries only follow timeouts and 5xx responses. */
  maxAttempts?: number;
  retryDelayMs?: number;
  now?: () => number;
}

export async function runExtraction(input: ExtractionInput, selection: ProviderSelection, options: RunOptions): Promise<ExtractionRun> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const fallback = (provider: string, model: string, errorCode: AiErrorCode): ExtractionRun => ({
    status: "FALLBACK",
    provider,
    model,
    suggestion: ruleBasedExtraction(input),
    latencyMs: now() - startedAt,
    errorCode,
  });

  if (!selection.provider) return fallback(FALLBACK_PROVIDER, FALLBACK_MODEL, selection.reason);
  const { provider } = selection;
  const maxAttempts = Math.min(Math.max(options.maxAttempts ?? 2, 1), 3);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = await provider.requestExtraction(input, AbortSignal.timeout(options.timeoutMs));
      const suggestion = toSuggestion(extractJsonObject(text), input.report, input.categories);
      if (!suggestion) return fallback(provider.name, provider.model, "INVALID_OUTPUT");
      return {
        status: "SUCCEEDED",
        provider: provider.name,
        model: provider.model,
        suggestion,
        latencyMs: now() - startedAt,
        errorCode: null,
      };
    } catch (error) {
      const failure = error instanceof ProviderFailure ? error : new ProviderFailure("PROVIDER_ERROR", false, "unexpected error");
      if (!failure.retryable || attempt === maxAttempts) {
        return fallback(provider.name, provider.model, failure.code);
      }
      await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? 400));
    }
  }
  return fallback(provider.name, provider.model, "PROVIDER_ERROR");
}
