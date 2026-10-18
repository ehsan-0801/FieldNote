"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowRightIcon, CircleNotchIcon, QuotesIcon, SparkleIcon } from "@phosphor-icons/react/ssr";
import { Priority } from "@/generated/prisma/enums";
import { AI_ERROR_CODES, AI_ERROR_MESSAGE } from "@/domain/extraction";
import { PRIORITY_FACTORS, PRIORITY_SIGNALS, assessPriority, factorsFromSignals, type PriorityFactorValues } from "@/domain/priority";
import { anyData, callApi, type ApiFailure } from "@/lib/api-client";
import { PriorityLabel } from "../ui/priority-label";
import { InlineNotice } from "../ui/states";
import { extractionSourceLabel, type StoredExtraction } from "./suggestion-summary";

const draftResponseSchema = z.object({
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
    signals: z.array(z.object({ factor: z.enum(PRIORITY_SIGNALS), evidence: z.string() })),
    missingDetails: z.array(z.string()),
    suggestedNextStep: z.string(),
    confidence: z.number().nullable(),
  }),
});

export interface ReviewValues {
  title: string;
  summary: string;
  categoryId: string;
  locationLabel: string;
  assetLabel: string;
  factors: PriorityFactorValues;
}

type DraftState =
  { kind: "idle" } | { kind: "loading" } | { kind: "ready"; extraction: StoredExtraction } | { kind: "failed"; error: ApiFailure };

type TextField = "title" | "summary" | "categoryId";

const LOW_CONFIDENCE = 50;

function SuggestedTag({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-[4px] bg-signal-soft px-1.5 py-px font-mono text-[10px] font-medium tracking-wide text-signal uppercase">
      <SparkleIcon size={10} aria-hidden />
      Suggested
    </span>
  );
}
const CLIENT_TIMEOUT_MS = 20_000;

/**
 * Review step for a saved report. AI output fills the form as labelled suggestions
 * the person can change; nothing becomes canonical until they save it.
 */
export function SuggestionReviewPanel({
  workOrderId,
  reference,
  originalReport,
  initial,
  categories,
  existingExtraction,
  autoDraft,
}: {
  workOrderId: string;
  reference: string;
  originalReport: string;
  initial: ReviewValues;
  categories: { id: string; name: string; slug: string }[];
  existingExtraction: StoredExtraction | null;
  autoDraft: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ReviewValues>(initial);
  const [suggested, setSuggested] = useState<Set<TextField | "factors">>(new Set());
  const [draft, setDraft] = useState<DraftState>(existingExtraction ? { kind: "ready", extraction: existingExtraction } : { kind: "idle" });
  const [saving, setSaving] = useState<"triage" | "later" | null>(null);
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const controller = useRef<AbortController | null>(null);
  const started = useRef(false);

  function applySuggestion(extraction: StoredExtraction) {
    const { suggestion } = extraction;
    const category = categories.find((option) => option.slug === suggestion.categorySlug);
    setValues((current) => ({
      ...current,
      title: suggestion.suggestedTitle || current.title,
      summary: suggestion.summary || current.summary,
      categoryId: category?.id ?? current.categoryId,
      factors: factorsFromSignals(suggestion.signals.map((signal) => signal.factor)),
    }));
    const marked = new Set<TextField | "factors">(["title", "summary", "factors"]);
    if (category) marked.add("categoryId");
    setSuggested(marked);
  }

  async function requestDraft() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const timer = setTimeout(() => abort.abort(), CLIENT_TIMEOUT_MS);
    setDraft({ kind: "loading" });
    const result = await callApi("/api/ai/parse-report", {
      method: "POST",
      body: { workOrderId },
      schema: draftResponseSchema,
      signal: abort.signal,
    });
    clearTimeout(timer);
    if (abort.signal.aborted && !result.ok) {
      setDraft({
        kind: "failed",
        error: { code: "ABORTED", message: "Stopped waiting for suggestions. Your report is saved; continue manually." },
      });
      return;
    }
    if (!result.ok) {
      setDraft({ kind: "failed", error: result.error });
      return;
    }
    setDraft({ kind: "ready", extraction: result.data });
    applySuggestion(result.data);
  }

  const startAutoDraft = useEffectEvent(() => {
    void requestDraft();
  });

  useEffect(() => {
    // The draft request is a one-off for this saved report, guarded against double mounting.
    if (autoDraft && !existingExtraction && !started.current) {
      started.current = true;
      startAutoDraft();
    }
  }, [autoDraft, existingExtraction]);

  useEffect(() => () => controller.current?.abort(), []);

  const update =
    (field: TextField | "locationLabel" | "assetLabel") =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [field]: next }));
      if (field === "title" || field === "summary" || field === "categoryId") {
        setSuggested((current) => {
          const copy = new Set(current);
          copy.delete(field);
          return copy;
        });
      }
    };

  const assessment = assessPriority(values.factors);
  const extraction = draft.kind === "ready" ? draft.extraction : null;
  const evidenceFor = (signal: string) => extraction?.suggestion.signals.find((item) => item.factor === signal);
  const lowConfidence =
    extraction?.status === "SUCCEEDED" && extraction.suggestion.confidence !== null && extraction.suggestion.confidence < LOW_CONFIDENCE;

  async function save(sendToTriage: boolean) {
    if (values.title.trim().length < 3) {
      setSaveError({
        code: "VALIDATION_ERROR",
        message: "Give the work order a short title.",
        fieldErrors: { title: ["Give the work order a short title."] },
      });
      return;
    }
    setSaving(sendToTriage ? "triage" : "later");
    setSaveError(null);
    const patch = await callApi(`/api/work-orders/${workOrderId}`, {
      method: "PATCH",
      body: {
        title: values.title.trim(),
        summary: values.summary.trim() || null,
        categoryId: values.categoryId || null,
        locationLabel: values.locationLabel.trim() || null,
        assetLabel: values.assetLabel.trim() || null,
        factors: values.factors,
      },
      schema: anyData,
    });
    if (!patch.ok) {
      setSaving(null);
      setSaveError(patch.error);
      return;
    }
    if (sendToTriage) {
      const moved = await callApi(`/api/work-orders/${workOrderId}/transition`, {
        method: "POST",
        body: { toStatus: "TRIAGE" },
        schema: anyData,
      });
      if (!moved.ok) {
        setSaving(null);
        setSaveError(moved.error);
        return;
      }
    }
    router.push(`/app/work-orders/${workOrderId}${sendToTriage ? "?submitted=1" : ""}`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <figure className="rounded-panel border border-rule bg-paper px-4 py-3">
          <figcaption className="label-mono mb-1.5">Original report · saved as {reference}</figcaption>
          <blockquote className="text-sm leading-relaxed whitespace-pre-line">{originalReport}</blockquote>
        </figure>

        <div aria-live="polite" className="space-y-2">
          {draft.kind === "idle" ? (
            <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-rule-strong px-4 py-3 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-ink-muted">
                Let Fieldnote propose a title, category and priority factors from the note, or fill them in yourself.
              </p>
              <button type="button" className="btn btn-signal" onClick={requestDraft}>
                <SparkleIcon size={16} aria-hidden />
                Draft structure from note
              </button>
            </div>
          ) : null}
          {draft.kind === "loading" ? (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-panel border border-rule bg-chalk px-4 py-3 text-sm">
              <CircleNotchIcon size={18} className="animate-spin text-signal motion-reduce:animate-none" aria-hidden />
              <span className="flex-1">Reading the report…</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => controller.current?.abort()}>
                Stop and continue manually
              </button>
            </div>
          ) : null}
          {draft.kind === "failed" ? (
            <InlineNotice tone="warning" title="This report is saved. AI suggestions are unavailable right now.">
              {draft.error.code === "RATE_LIMITED" ? "Too many drafts were requested recently. " : null}
              Continue manually below; nothing is lost.
            </InlineNotice>
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

        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
          noValidate
        >
          <div className="sm:col-span-2">
            <label htmlFor="review-title" className="field-label">
              Title
              <SuggestedTag active={suggested.has("title")} />
            </label>
            <input
              id="review-title"
              className="input"
              value={values.title}
              onChange={update("title")}
              maxLength={100}
              required
              aria-invalid={Boolean(saveError?.fieldErrors?.title)}
              aria-describedby="review-title-error"
            />
            <p id="review-title-error" className="field-error">
              {saveError?.fieldErrors?.title?.[0] ?? ""}
            </p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="review-summary" className="field-label">
              Summary
              <SuggestedTag active={suggested.has("summary")} />
            </label>
            <textarea id="review-summary" className="input" rows={3} value={values.summary} onChange={update("summary")} maxLength={600} />
          </div>
          <div>
            <label htmlFor="review-category" className="field-label">
              Category
              <SuggestedTag active={suggested.has("categoryId")} />
            </label>
            <select id="review-category" className="input" value={values.categoryId} onChange={update("categoryId")}>
              <option value="">Not sure</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="review-location" className="field-label">
              Location
            </label>
            <input id="review-location" className="input" value={values.locationLabel} onChange={update("locationLabel")} maxLength={120} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="review-asset" className="field-label">
              Asset <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input id="review-asset" className="input" value={values.assetLabel} onChange={update("assetLabel")} maxLength={120} />
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="field-label">
              What makes this urgent?
              <SuggestedTag active={suggested.has("factors")} />
            </legend>
            <ul className="grid gap-2 sm:grid-cols-2">
              {PRIORITY_FACTORS.map((factor) => {
                const quote = evidenceFor(factor.signal);
                return (
                  <li key={factor.field}>
                    <label className="flex h-full items-start gap-2.5 rounded-control border border-rule bg-chalk px-3 py-2.5 text-sm has-[:checked]:border-signal/60 has-[:checked]:bg-signal-soft/50">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-signal"
                        checked={values.factors[factor.field]}
                        onChange={(event) => {
                          setValues((current) => ({ ...current, factors: { ...current.factors, [factor.field]: event.target.checked } }));
                          setSuggested((current) => {
                            const copy = new Set(current);
                            copy.delete("factors");
                            return copy;
                          });
                        }}
                      />
                      <span>
                        <span className="font-medium">{factor.label}</span>
                        {quote ? <span className="mt-0.5 block text-xs text-ink-muted">from “{quote.evidence}”</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <PriorityLabel priority={assessment.priority} unconfirmed />
              <span className="text-ink-muted">{assessment.rationale}</span>
            </p>
          </fieldset>

          <div className="sm:col-span-2" aria-live="polite">
            {saveError && !saveError.fieldErrors?.title ? <InlineNotice tone="danger">{saveError.message}</InlineNotice> : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="btn btn-primary" disabled={saving !== null || draft.kind === "loading"}>
              {saving === "triage" ? "Sending…" : "Send to triage"}
              <ArrowRightIcon size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => save(false)}
              disabled={saving !== null || draft.kind === "loading"}
            >
              {saving === "later" ? "Saving…" : "Save and finish later"}
            </button>
          </div>
        </form>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start" aria-label="Why this was suggested">
        <div className="panel p-4">
          <h2 className="panel-title mb-2">Why this was suggested</h2>
          {extraction ? (
            <div className="space-y-3 text-sm">
              <p className="label-mono">{extractionSourceLabel(extraction)}</p>
              {extraction.suggestion.signals.length ? (
                <ul className="space-y-2">
                  {extraction.suggestion.signals.map((signal) => (
                    <li key={signal.factor} className="flex items-start gap-2">
                      <QuotesIcon size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
                      <span>
                        <span className="font-medium">{PRIORITY_FACTORS.find((item) => item.signal === signal.factor)?.label}</span>
                        <span className="block text-ink-muted">“{signal.evidence}”</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">No impact signals were found in the text.</p>
              )}
              {extraction.suggestion.missingDetails.length ? (
                <div>
                  <p className="font-medium">Worth adding</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-muted">
                    {extraction.suggestion.missingDetails.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-ink-muted">
                <span className="font-medium text-ink">Next step:</span> {extraction.suggestion.suggestedNextStep}
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Suggestions and the phrases they came from will appear here.</p>
          )}
        </div>
        <p className="px-1 text-xs text-ink-muted">
          Suggestions are a starting point. Priority is calculated from the factors you tick and confirmed by a coordinator; it is not a
          safety assessment.
        </p>
      </aside>
    </div>
  );
}
