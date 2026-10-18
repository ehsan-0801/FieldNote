"use client";

import { useState } from "react";
import { QuotesIcon } from "@phosphor-icons/react/ssr";
import type { Priority } from "@/generated/prisma/enums";
import type { EvidenceSignal } from "@/domain/extraction";
import { PRIORITY_FACTORS, assessPriority, type PriorityFactorValues } from "@/domain/priority";
import { anyData } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useApiAction } from "@/lib/use-api-action";
import { PriorityLabel } from "../ui/priority-label";
import { InlineNotice } from "../ui/states";

/**
 * Shows how priority was derived. Editors tick factors; the score and band are
 * recomputed live with the same function the server uses.
 */
export function PriorityPanel({
  workOrderId,
  priority,
  rationale,
  factors,
  confirmedAt,
  evidence,
  mode,
}: {
  workOrderId: string;
  priority: Priority;
  rationale: string | null;
  factors: PriorityFactorValues;
  confirmedAt: Date | null;
  evidence: EvidenceSignal[];
  /** confirm: coordinator/admin; propose: reporter during review; view: read-only. */
  mode: "confirm" | "propose" | "view";
}) {
  const [draft, setDraft] = useState<PriorityFactorValues>(factors);
  const action = useApiAction();
  const preview = assessPriority(draft);
  const dirty = PRIORITY_FACTORS.some((factor) => draft[factor.field] !== factors[factor.field]);
  const evidenceFor = (signal: string) => evidence.find((item) => item.factor === signal);

  async function save() {
    await action.run(`/api/work-orders/${workOrderId}`, "PATCH", { factors: draft }, anyData);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <PriorityLabel priority={mode === "view" ? priority : preview.priority} unconfirmed={!confirmedAt} />
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          score {mode === "view" ? assessPriority(factors).score : preview.score}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">{mode === "view" ? rationale : preview.rationale}</p>

      <fieldset disabled={mode === "view" || action.pending}>
        <legend className="label-mono mb-2">Factors</legend>
        <ul className="space-y-1.5">
          {PRIORITY_FACTORS.map((factor) => {
            const quote = evidenceFor(factor.signal);
            const id = `factor-${factor.field}`;
            return (
              <li key={factor.field}>
                <label htmlFor={id} className="flex items-start gap-2.5 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-0.5 size-4 accent-signal"
                    checked={draft[factor.field]}
                    onChange={(event) => setDraft((value) => ({ ...value, [factor.field]: event.target.checked }))}
                  />
                  <span className="min-w-0">
                    <span className="font-medium">{factor.label}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-ink-muted">+{factor.weight}</span>
                    {quote ? (
                      <span className="mt-0.5 flex items-start gap-1 text-xs text-ink-muted">
                        <QuotesIcon size={12} className="mt-0.5 shrink-0" aria-hidden />
                        <span>“{quote.evidence}”</span>
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {mode !== "view" ? (
        <div className="space-y-2">
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={save}
            disabled={action.pending || (mode === "propose" && !dirty)}
          >
            {action.pending
              ? "Saving…"
              : mode === "confirm"
                ? confirmedAt && !dirty
                  ? "Re-confirm priority"
                  : "Confirm priority"
                : "Save factors"}
          </button>
          {mode === "propose" ? <p className="field-hint">A coordinator confirms priority after the report reaches triage.</p> : null}
        </div>
      ) : null}
      {confirmedAt ? <p className="font-mono text-[11px] text-ink-muted">Confirmed {formatDateTime(confirmedAt)}</p> : null}
      <div aria-live="polite">{action.error ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}</div>
    </div>
  );
}
