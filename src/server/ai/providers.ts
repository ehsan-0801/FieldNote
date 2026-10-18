import { z } from "zod";
import { SYSTEM_INSTRUCTION, buildUserPrompt, extractionJsonSchema, geminiResponseSchema } from "./prompt";
import { ProviderFailure, type ExtractionInput, type ReportExtractionProvider } from "./types";

export type FetchLike = typeof fetch;

/** Maps HTTP outcomes to failure codes; provider bodies are never forwarded to users. */
export async function postJson(fetcher: FetchLike, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new ProviderFailure("TIMEOUT", true, "request timed out");
    }
    throw new ProviderFailure("PROVIDER_ERROR", true, "network error");
  }
  if (response.status === 429) throw new ProviderFailure("RATE_LIMITED", false, "rate limited");
  if (response.status >= 500) throw new ProviderFailure("PROVIDER_ERROR", true, `upstream ${response.status}`);
  if (!response.ok) throw new ProviderFailure("PROVIDER_ERROR", false, `upstream ${response.status}`);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderFailure("PROVIDER_ERROR", false, "response was not JSON");
  }
}

const geminiResponse = z.object({
  candidates: z.array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) })).min(1),
});

export function createGeminiProvider(apiKey: string, model: string, fetcher: FetchLike = fetch): ReportExtractionProvider {
  return {
    name: "gemini",
    model,
    async requestExtraction(input: ExtractionInput, signal: AbortSignal) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const json = await postJson(
        fetcher,
        url,
        { "x-goog-api-key": apiKey },
        {
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: geminiResponseSchema(input),
          },
        },
        signal,
      );
      const parsed = geminiResponse.safeParse(json);
      if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected response shape");
      return parsed.data.candidates[0].content.parts.map((part) => part.text ?? "").join("");
    },
  };
}

const groqResponse = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

/** Groq exposes an OpenAI-compatible API; strict json_schema mode is used where the model supports it. */
export function createGroqProvider(apiKey: string, model: string, fetcher: FetchLike = fetch): ReportExtractionProvider {
  return {
    name: "groq",
    model,
    async requestExtraction(input: ExtractionInput, signal: AbortSignal) {
      const json = await postJson(
        fetcher,
        "https://api.groq.com/openai/v1/chat/completions",
        { authorization: `Bearer ${apiKey}` },
        {
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: buildUserPrompt(input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "work_order_draft", strict: true, schema: extractionJsonSchema(input) },
          },
        },
        signal,
      );
      const parsed = groqResponse.safeParse(json);
      if (!parsed.success) throw new ProviderFailure("PROVIDER_ERROR", false, "unexpected response shape");
      return parsed.data.choices[0].message.content ?? "";
    },
  };
}
