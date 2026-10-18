"use client";

import { useState } from "react";
import { z } from "zod";
import { SparkleIcon } from "@phosphor-icons/react/ssr";
import { NO_FACTORS } from "@/domain/priority";
import { REPORT_MAX_LENGTH } from "@/domain/schemas";
import { callApi, type ApiFailure } from "@/lib/api-client";
import { InlineNotice } from "../ui/states";
import { SuggestionReviewPanel } from "./suggestion-review-panel";

const createdSchema = z.object({ id: z.string(), reference: z.string() });

interface Saved {
  id: string;
  reference: string;
  report: string;
  locationLabel: string;
  assetLabel: string;
  autoDraft: boolean;
}

/** Stage one saves the plain-language report; stage two reviews structure on the same page. */
export function ReportComposer({ categories }: { categories: { id: string; name: string; slug: string }[] }) {
  const [report, setReport] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [assetLabel, setAssetLabel] = useState("");
  const [pending, setPending] = useState<"draft" | "manual" | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);

  async function submit(autoDraft: boolean) {
    setPending(autoDraft ? "draft" : "manual");
    setError(null);
    const result = await callApi("/api/work-orders", {
      method: "POST",
      body: { originalReport: report, locationLabel: locationLabel || null, assetLabel: assetLabel || null },
      schema: createdSchema,
    });
    setPending(null);
    if (!result.ok) return setError(result.error);
    setSaved({ ...result.data, report: report.trim(), locationLabel, assetLabel, autoDraft });
  }

  if (saved) {
    return (
      <SuggestionReviewPanel
        workOrderId={saved.id}
        reference={saved.reference}
        originalReport={saved.report}
        initial={{
          title: saved.report.split(/(?<=[.!?])\s/)[0]?.slice(0, 100) ?? "",
          summary: "",
          categoryId: "",
          locationLabel: saved.locationLabel,
          assetLabel: saved.assetLabel,
          factors: NO_FACTORS,
        }}
        categories={categories}
        existingExtraction={null}
        autoDraft={saved.autoDraft}
      />
    );
  }

  const reportError = error?.fieldErrors?.originalReport?.[0];
  return (
    <form
      className="max-w-2xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(true);
      }}
      noValidate
    >
      <div>
        <label htmlFor="report" className="field-label">
          Describe the issue
        </label>
        <textarea
          id="report"
          className="input min-h-40 text-[15px]"
          rows={6}
          value={report}
          onChange={(event) => setReport(event.target.value)}
          maxLength={REPORT_MAX_LENGTH}
          aria-invalid={Boolean(reportError)}
          aria-describedby="report-hint report-error"
          placeholder="What’s wrong, where, and since when? Write it the way you’d say it."
          required
        />
        <div className="flex justify-between gap-3">
          <p id="report-hint" className="field-hint">
            Your words are saved exactly as written. Contact details are removed before any AI provider sees the text.
          </p>
          <p className="field-hint font-mono tabular-nums">
            {report.length}/{REPORT_MAX_LENGTH}
          </p>
        </div>
        {reportError ? (
          <p id="report-error" className="field-error" role="alert">
            {reportError}
          </p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="location" className="field-label">
            Location <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="location"
            className="input"
            value={locationLabel}
            onChange={(event) => setLocationLabel(event.target.value)}
            maxLength={120}
            placeholder="e.g. Level 2 hallway"
          />
        </div>
        <div>
          <label htmlFor="asset" className="field-label">
            Asset <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="asset"
            className="input"
            value={assetLabel}
            onChange={(event) => setAssetLabel(event.target.value)}
            maxLength={120}
            placeholder="e.g. Fridge FR-1"
          />
        </div>
      </div>
      <div aria-live="polite">{error && !reportError ? <InlineNotice tone="danger">{error.message}</InlineNotice> : null}</div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-signal" disabled={pending !== null || report.trim().length < 12}>
          <SparkleIcon size={16} aria-hidden />
          {pending === "draft" ? "Saving report…" : "Draft structure from note"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => submit(false)}
          disabled={pending !== null || report.trim().length < 12}
        >
          {pending === "manual" ? "Saving report…" : "Fill in details myself"}
        </button>
      </div>
      <p className="text-xs text-ink-muted">Both options save the report first. You review every field before it goes to triage.</p>
    </form>
  );
}
