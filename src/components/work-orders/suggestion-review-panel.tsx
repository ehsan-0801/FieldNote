"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, SparkleIcon } from "@phosphor-icons/react/ssr";
import { draftTitle } from "@/domain/drafting";
import { extractionResponseSchema } from "@/domain/extraction";
import { PRIORITY_FACTORS, assessPriority, factorsFromSignals, type PriorityFactorValues } from "@/domain/priority";
import { anyData, callApi, type ApiFailure } from "@/lib/api-client";
import { PriorityLabel } from "../ui/priority-label";
import { InlineNotice } from "../ui/states";
import { DraftStatus, type DraftState } from "./draft-status";
import { SuggestionSummary, type StoredExtraction } from "./suggestion-summary";

export interface ReviewValues {
  title: string;
  summary: string;
  categoryId: string;
  locationLabel: string;
  assetLabel: string;
  factors: PriorityFactorValues;
}

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

function suggestedValues(current: ReviewValues, extraction: StoredExtraction, categories: { id: string; slug: string }[]) {
  const { suggestion } = extraction;
  const category = categories.find((option) => option.slug === suggestion.categorySlug);
  const values: ReviewValues = {
    ...current,
    title: suggestion.suggestedTitle || current.title,
    summary: suggestion.summary || current.summary,
    categoryId: category?.id ?? current.categoryId,
    factors: factorsFromSignals(suggestion.signals.map((signal) => signal.factor)),
  };
  const suggested = new Set<TextField | "factors">(["title", "summary", "factors"]);
  if (category) suggested.add("categoryId");
  return { values, suggested };
}

function resumeFromStoredDraft(
  initial: ReviewValues,
  originalReport: string,
  extraction: StoredExtraction | null,
  categories: { id: string; slug: string }[],
) {
  const untouched =
    initial.title === draftTitle(originalReport) &&
    !initial.summary &&
    !initial.categoryId &&
    PRIORITY_FACTORS.every((factor) => !initial.factors[factor.field]);
  if (!extraction || !untouched) return { values: initial, suggested: new Set<TextField | "factors">() };
  return suggestedValues(initial, extraction, categories);
}

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
  focusOnMount = false,
}: {
  workOrderId: string;
  reference: string;
  originalReport: string;
  initial: ReviewValues;
  categories: { id: string; name: string; slug: string }[];
  existingExtraction: StoredExtraction | null;
  autoDraft: boolean;
  focusOnMount?: boolean;
}) {
  const router = useRouter();
  // Resuming a draft that was never reviewed starts from its stored suggestion, not from blank fields.
  const [resumed] = useState(() => resumeFromStoredDraft(initial, originalReport, existingExtraction, categories));
  const [values, setValues] = useState<ReviewValues>(resumed.values);
  const [suggested, setSuggested] = useState<Set<TextField | "factors">>(resumed.suggested);
  const [draft, setDraft] = useState<DraftState>(existingExtraction ? { kind: "ready", extraction: existingExtraction } : { kind: "idle" });
  const [saving, setSaving] = useState<"triage" | "later" | null>(null);
  const [saveError, setSaveError] = useState<ApiFailure | null>(null);
  const controller = useRef<AbortController | null>(null);
  const started = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  function applySuggestion(extraction: StoredExtraction) {
    const next = suggestedValues(values, extraction, categories);
    setValues(next.values);
    setSuggested(next.suggested);
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
      schema: extractionResponseSchema,
      signal: abort.signal,
    });
    clearTimeout(timer);
    // A newer request (or a remount) replaced this one; its result no longer applies.
    if (controller.current !== abort) return;
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
    // One draft per saved report. If the component unmounts mid-request (including React's
    // development double-mount), the request is cancelled and allowed to start again.
    if (autoDraft && !existingExtraction && !started.current) {
      started.current = true;
      startAutoDraft();
    }
    return () => {
      if (controller.current && !controller.current.signal.aborted) {
        controller.current.abort();
        controller.current = null;
        started.current = false;
      }
    };
  }, [autoDraft, existingExtraction]);

  // Moving focus to the form's heading tells keyboard and screen-reader users the step changed.
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);

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
        // Unchanged factors aren't resent, so saving doesn't re-confirm or re-audit priority.
        ...(PRIORITY_FACTORS.some((factor) => values.factors[factor.field] !== initial.factors[factor.field])
          ? { factors: values.factors }
          : {}),
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <h2 ref={heading} tabIndex={-1} className="text-[15px] font-semibold focus:outline-none">
          Review the details
        </h2>
        <figure className="rounded-panel border border-rule bg-paper px-4 py-3">
          <figcaption className="label-mono mb-1.5">Original report · saved as {reference}</figcaption>
          <blockquote className="text-sm leading-relaxed wrap-anywhere whitespace-pre-line">{originalReport}</blockquote>
        </figure>

        <DraftStatus draft={draft} lowConfidence={lowConfidence} onDraft={requestDraft} onStop={() => controller.current?.abort()} />

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
            <SuggestionSummary extraction={extraction} />
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
