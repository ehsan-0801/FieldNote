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

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** One JSON-only completion. Each adapter enforces the schema as far as its model allows. */
export interface JsonRequest {
  system: string;
  turns: readonly ChatTurn[];
  schemaName: string;
  /** Standard JSON Schema (all keys required, no extras). */
  jsonSchema: Record<string, unknown>;
  /** The same schema in Gemini's OpenAPI subset. */
  geminiSchema: Record<string, unknown>;
  temperature: number;
  signal: AbortSignal;
}

export interface JsonCompleter {
  readonly name: string;
  readonly model: string;
  /** Returns the raw text the model produced; parsing and validation happen in the caller. */
  complete(request: JsonRequest): Promise<string>;
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
  /** Upstream HTTP status when there was one; used to explain connection tests, never shown raw. */
  readonly httpStatus: number | null;

  constructor(code: ProviderFailureCode, retryable: boolean, detail: string, httpStatus: number | null = null) {
    super(detail);
    this.name = "ProviderFailure";
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
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
