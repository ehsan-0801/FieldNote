import { LightbulbIcon, QuestionIcon, QuotesIcon } from "@phosphor-icons/react/ssr";
import { AI_ERROR_MESSAGE, type AiErrorCode, type ExtractionSuggestion } from "@/domain/extraction";
import { PRIORITY_FACTORS, PRIORITY_LABEL } from "@/domain/priority";
import { formatDateTime } from "@/lib/format";

export interface StoredExtraction {
  provider: string;
  model: string;
  status: "SUCCEEDED" | "FALLBACK";
  errorCode: AiErrorCode | null;
  createdAt: Date | string;
  suggestion: ExtractionSuggestion;
}

/** Honest label for where a draft came from; a rule-based draft never claims to be a model. */
export function extractionSourceLabel(extraction: Pick<StoredExtraction, "provider" | "model" | "status">): string {
  return extraction.status === "SUCCEEDED"
    ? `Suggested by ${extraction.provider} · ${extraction.model}`
    : "Rule-based draft (no AI model used)";
}

/** Read-only “why this was suggested” panel shown on the detail page after review. */
export function SuggestionSummary({ extraction }: { extraction: StoredExtraction }) {
  const { suggestion } = extraction;
  const signalLabel = (factor: string) => PRIORITY_FACTORS.find((item) => item.signal === factor)?.label ?? factor;
  return (
    <div className="space-y-3 text-sm">
      <p className="label-mono">{extractionSourceLabel(extraction)}</p>
      {extraction.status === "FALLBACK" && extraction.errorCode ? (
        <p className="text-xs text-ink-muted">{AI_ERROR_MESSAGE[extraction.errorCode]}</p>
      ) : null}
      <p>
        Suggested priority <span className="font-medium">{PRIORITY_LABEL[suggestion.suggestedPriority]}</span>
        {suggestion.confidence !== null ? (
          <span className="text-ink-muted"> · self-reported confidence {suggestion.confidence}/100 (heuristic)</span>
        ) : null}
      </p>
      {suggestion.signals.length > 0 ? (
        <ul className="space-y-1.5">
          {suggestion.signals.map((signal) => (
            <li key={signal.factor} className="flex items-start gap-2">
              <QuotesIcon size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
              <span>
                <span className="font-medium">{signalLabel(signal.factor)}</span>
                <span className="text-ink-muted"> from “{signal.evidence}”</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted">No impact signals were found in the report text.</p>
      )}
      {suggestion.missingDetails.length > 0 ? (
        <div>
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <QuestionIcon size={14} aria-hidden />
            Details the report didn’t include
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-ink-muted">
            {suggestion.missingDetails.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="flex items-start gap-1.5">
        <LightbulbIcon size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <span>
          <span className="font-medium">Suggested next step:</span> {suggestion.suggestedNextStep}
        </span>
      </p>
      <p className="font-mono text-[11px] text-ink-muted">Drafted {formatDateTime(extraction.createdAt)}</p>
    </div>
  );
}
