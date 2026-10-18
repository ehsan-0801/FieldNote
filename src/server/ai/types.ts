import type { AiErrorCode, ExtractionSuggestion } from "@/domain/extraction";

export interface CategoryOption {
  slug: string;
  name: string;
}

/** Already-redacted input; nothing here identifies a user or a database record. */
export interface ExtractionInput {
  report: string;
  locationLabel: string | null;
  assetLabel: string | null;
  categories: readonly CategoryOption[];
}

export interface ReportExtractionProvider {
  readonly name: string;
  readonly model: string;
  /** Returns the raw text the model produced; parsing and validation happen elsewhere. */
  requestExtraction(input: ExtractionInput, signal: AbortSignal): Promise<string>;
}

export type ProviderFailureCode = Extract<AiErrorCode, "TIMEOUT" | "RATE_LIMITED" | "PROVIDER_ERROR">;

export class ProviderFailure extends Error {
  readonly code: ProviderFailureCode;
  readonly retryable: boolean;

  constructor(code: ProviderFailureCode, retryable: boolean, detail: string) {
    super(detail);
    this.name = "ProviderFailure";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface ExtractionRun {
  status: "SUCCEEDED" | "FALLBACK";
  provider: string;
  model: string;
  suggestion: ExtractionSuggestion;
  latencyMs: number;
  errorCode: AiErrorCode | null;
}
