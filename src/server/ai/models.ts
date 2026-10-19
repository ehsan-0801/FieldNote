import { z } from "zod";
import type { AiProviderKind } from "@/domain/ai-providers";
import { anthropicClient, toProviderFailure } from "./anthropic";
import { GEMINI_BASE_URL, GROQ_BASE_URL, requestJson, type FetchLike } from "./providers";
import { ProviderFailure } from "./types";

export interface ModelLookup {
  kind: AiProviderKind;
  apiKey: string;
  /** Required for openai_compatible. */
  baseUrl: string | null;
}

const MAX_MODELS = 300;

// Listed by most services next to their chat models, but unable to answer a chat prompt.
const NOT_CHAT =
  /embed|whisper|tts|transcri|dall-e|image|moderation|rerank|audio|realtime|speech|vision-preview|guard|davinci|babbage|search/i;

const geminiModels = z.object({
  models: z
    .array(z.object({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() }))
    .optional()
    .default([]),
});
const openAiModels = z.object({ data: z.array(z.object({ id: z.string() })) });

/**
 * The chat models this key can use, as the provider names them. Sorted, deduplicated and
 * capped; the provider's response is otherwise discarded.
 */
export async function listModels(lookup: ModelLookup, signal: AbortSignal, fetcher: FetchLike = fetch): Promise<string[]> {
  let ids: string[];
  if (lookup.kind === "gemini") {
    const json = await requestJson(
      fetcher,
      `${GEMINI_BASE_URL}/models?pageSize=1000`,
      { method: "GET", headers: { "x-goog-api-key": lookup.apiKey } },
      signal,
    );
    const parsed = geminiModels.safeParse(json);
    if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected model list");
    ids = parsed.data.models
      .filter((model) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent"))
      .map((model) => model.name.replace(/^models\//, ""));
  } else if (lookup.kind === "anthropic") {
    ids = [];
    try {
      for await (const model of anthropicClient(lookup.apiKey, fetcher).models.list({ limit: 100 }, { signal })) {
        ids.push(model.id);
        if (ids.length >= MAX_MODELS) break;
      }
    } catch (error) {
      throw toProviderFailure(error);
    }
  } else {
    const baseUrl = lookup.kind === "groq" ? GROQ_BASE_URL : lookup.baseUrl;
    if (!baseUrl) throw new ProviderFailure("PROVIDER_ERROR", false, "no base URL");
    const json = await requestJson(
      fetcher,
      `${baseUrl.replace(/\/+$/, "")}/models`,
      { method: "GET", headers: { authorization: `Bearer ${lookup.apiKey}` } },
      signal,
    );
    const parsed = openAiModels.safeParse(json);
    if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected model list");
    ids = parsed.data.data.map((model) => model.id);
  }
  const usable = ids.filter((id) => /^[\w.:/@-]{1,120}$/.test(id) && !NOT_CHAT.test(id));
  return [...new Set(usable)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_MODELS);
}

/** The first preferred model the provider offers, else the first listed model. */
export function chooseModel(available: readonly string[], preferred: readonly string[]): string | null {
  return preferred.find((model) => available.includes(model)) ?? available[0] ?? null;
}
