import { z } from "zod";
import { Priority } from "@/generated/prisma/enums";
import { PRIORITY_SIGNALS, type PrioritySignal } from "./priority";

export const EXTRACTION_SCHEMA_VERSION = "v1";

/** Shape the model must return. Anything else is rejected and the rule-based draft is used. */
export const modelExtractionSchema = z.strictObject({
  suggestedTitle: z.string().trim().min(3).max(100),
  summary: z.string().trim().min(1).max(600),
  category: z.string().trim().max(60).nullable(),
  suggestedPriority: z.enum(Priority),
  signals: z.array(z.strictObject({ factor: z.enum(PRIORITY_SIGNALS), evidence: z.string().trim().min(2).max(200) })).max(8),
  missingDetails: z.array(z.string().trim().min(3).max(160)).max(5),
  suggestedNextStep: z.string().trim().min(3).max(240),
  confidence: z.number().int().min(0).max(100),
});
export type ModelExtraction = z.infer<typeof modelExtractionSchema>;

export interface EvidenceSignal {
  factor: PrioritySignal;
  evidence: string;
}

/** What the review form receives: validated, category resolved, evidence verified. */
export interface ExtractionSuggestion {
  suggestedTitle: string;
  summary: string;
  categorySlug: string | null;
  suggestedPriority: Priority;
  signals: EvidenceSignal[];
  missingDetails: string[];
  suggestedNextStep: string;
  /** Model self-estimate, explicitly heuristic. Null for rule-based drafts. */
  confidence: number | null;
}

export const AI_ERROR_CODES = ["NO_KEY", "TIMEOUT", "RATE_LIMITED", "PROVIDER_ERROR", "INVALID_OUTPUT", "DISABLED"] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const AI_ERROR_MESSAGE: Record<AiErrorCode, string> = {
  NO_KEY: "No AI provider is configured, so a rule-based draft was made instead.",
  DISABLED: "AI extraction is turned off for this workspace, so a rule-based draft was made instead.",
  TIMEOUT: "The AI provider took too long to answer. A rule-based draft was made instead.",
  RATE_LIMITED: "The AI provider is busy right now. A rule-based draft was made instead.",
  PROVIDER_ERROR: "This report is saved. AI suggestions are unavailable right now, so a rule-based draft was made instead.",
  INVALID_OUTPUT: "The AI answer didn’t match the expected format and was discarded. A rule-based draft was made instead.",
};

/** Persisted JSON is untrusted on the way back out, so it is re-validated before rendering. */
export const storedSuggestedFieldsSchema = z.object({
  categorySlug: z.string().nullable(),
  suggestedPriority: z.enum(Priority),
  suggestedNextStep: z.string().max(240),
});
export const storedSignalsSchema = z.array(z.object({ factor: z.enum(PRIORITY_SIGNALS), evidence: z.string().max(200) })).max(8);
export const storedMissingDetailsSchema = z.array(z.string().max(160)).max(5);

/** Response of POST /api/ai/parse-report as the client receives it (dates arrive as strings). */
export const extractionResponseSchema = z.object({
  provider: z.string(),
  model: z.string(),
  status: z.enum(["SUCCEEDED", "FALLBACK"]),
  errorCode: z.enum(AI_ERROR_CODES).nullable(),
  createdAt: z.string(),
  suggestion: z.object({
    suggestedTitle: z.string(),
    summary: z.string(),
    categorySlug: z.string().nullable(),
    suggestedPriority: z.enum(Priority),
    signals: storedSignalsSchema,
    missingDetails: storedMissingDetailsSchema,
    suggestedNextStep: z.string(),
    confidence: z.number().nullable(),
  }),
});
