import { CircleNotchIcon, SparkleIcon } from "@phosphor-icons/react/ssr";
import { AI_ERROR_MESSAGE } from "@/domain/extraction";
import type { ApiFailure } from "@/lib/api-client";
import { InlineNotice } from "../ui/states";
import type { StoredExtraction } from "./suggestion-summary";

export type DraftState =
  { kind: "idle" } | { kind: "loading" } | { kind: "ready"; extraction: StoredExtraction } | { kind: "failed"; error: ApiFailure };

/** Where drafting stands: offer, in progress (cancellable), failed, rule-based, or low confidence. */
export function DraftStatus({
  draft,
  lowConfidence,
  onDraft,
  onStop,
}: {
  draft: DraftState;
  lowConfidence: boolean;
  onDraft: () => void;
  onStop: () => void;
}) {
  const extraction = draft.kind === "ready" ? draft.extraction : null;
  return (
    <div aria-live="polite" className="space-y-2">
      {draft.kind === "idle" ? (
        <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-rule-strong px-4 py-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink-muted">
            Let Fieldnote propose a title, category and priority factors from the note, or fill them in yourself.
          </p>
          <button type="button" className="btn btn-signal" onClick={onDraft}>
            <SparkleIcon size={16} aria-hidden />
            Draft structure from note
          </button>
        </div>
      ) : null}
      {draft.kind === "loading" ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-panel border border-rule bg-chalk px-4 py-3 text-sm">
          <CircleNotchIcon size={18} className="animate-spin text-signal motion-reduce:animate-none" aria-hidden />
          <span className="flex-1">Reading the report…</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onStop}>
            Stop and continue manually
          </button>
        </div>
      ) : null}
      {draft.kind === "failed" ? (
        <div className="space-y-2">
          {draft.error.code === "ABORTED" ? (
            <InlineNotice tone="info" title="Drafting stopped.">
              Your report is saved. Fill in the details below, or draft again.
            </InlineNotice>
          ) : (
            <InlineNotice tone="warning" title="This report is saved. AI suggestions are unavailable right now.">
              {draft.error.code === "RATE_LIMITED" ? "Too many drafts were requested recently. " : null}
              Continue manually below; nothing is lost.
            </InlineNotice>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDraft}>
            <SparkleIcon size={14} aria-hidden />
            Draft again
          </button>
        </div>
      ) : null}
      {extraction?.status === "FALLBACK" ? (
        <InlineNotice tone="info" title="Rule-based draft">
          {extraction.errorCode ? AI_ERROR_MESSAGE[extraction.errorCode] : "A rule-based draft was made."} Check every field.
        </InlineNotice>
      ) : null}
      {lowConfidence ? (
        <InlineNotice tone="warning" title="Check these details">
          The suggestion came back with low confidence. Review each field before sending.
        </InlineNotice>
      ) : null}
    </div>
  );
}
