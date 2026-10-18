import { modelExtractionSchema, type EvidenceSignal, type ExtractionSuggestion } from "@/domain/extraction";
import type { CategoryOption } from "./types";

/**
 * Pulls a JSON object out of model text. Models sometimes wrap JSON in markdown
 * fences or add a sentence around it; anything that still doesn't parse is null.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s"“”'’]+/g, " ")
    .trim();

/**
 * Validates model output against the strict schema, then applies checks the
 * schema can't express: the category must exist in this workspace, and every
 * evidence quote must actually appear in the report the model was given.
 */
export function toSuggestion(raw: unknown, sourceText: string, categories: readonly CategoryOption[]): ExtractionSuggestion | null {
  const parsed = modelExtractionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const output = parsed.data;

  const normalizedSource = normalize(sourceText);
  const seen = new Set<string>();
  const signals: EvidenceSignal[] = [];
  for (const signal of output.signals) {
    if (seen.has(signal.factor)) continue;
    if (!normalizedSource.includes(normalize(signal.evidence))) continue;
    seen.add(signal.factor);
    signals.push({ factor: signal.factor, evidence: signal.evidence });
  }

  const wanted = output.category?.toLowerCase();
  const category = categories.find((option) => option.slug === wanted || option.name.toLowerCase() === wanted);

  return {
    suggestedTitle: output.suggestedTitle,
    summary: output.summary,
    categorySlug: category?.slug ?? null,
    suggestedPriority: output.suggestedPriority,
    signals,
    missingDetails: output.missingDetails.slice(0, 3),
    suggestedNextStep: output.suggestedNextStep,
    confidence: output.confidence,
  };
}
