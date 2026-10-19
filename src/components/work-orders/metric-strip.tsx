import type { Priority } from "@/generated/prisma/enums";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "@/domain/priority";
import { AT_RISK_AGE_DAYS } from "@/server/work-orders/queries";

interface Metrics {
  open: number;
  waitingForAssignment: number;
  atRisk: number;
  resolvedThisWeek: number;
}

// Plain figures: no list filter reproduces these exact counts, so they are not links.
const METRICS: { key: keyof Metrics; label: string; hint: string }[] = [
  { key: "open", label: "Open work", hint: "Submitted through blocked" },
  { key: "waitingForAssignment", label: "Waiting for an owner", hint: "Open with nobody assigned" },
  { key: "atRisk", label: "At risk", hint: `Urgent, blocked, or high and older than ${AT_RISK_AGE_DAYS} days` },
  { key: "resolvedThisWeek", label: "Resolved this week", hint: "Since Monday 00:00 UTC" },
];

export function MetricStrip({ metrics }: { metrics: Metrics }) {
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-panel border border-rule bg-chalk lg:grid-cols-4">
      {METRICS.map((metric, index) => (
        <div
          key={metric.key}
          className={`px-4 py-4 ${index % 2 ? "border-l border-rule" : ""} ${index > 1 ? "border-t border-rule lg:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`}
        >
          <dt className="text-[13px] font-medium text-ink">{metric.label}</dt>
          <dd className="mt-1 font-mono text-[28px] leading-none font-medium tabular-nums">{metrics[metric.key]}</dd>
          <dd className="mt-1.5 text-xs text-ink-muted">{metric.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

const BAR_TONE: Record<Priority, string> = {
  URGENT: "bg-oxide",
  HIGH: "bg-oxide/55",
  NORMAL: "bg-signal/70",
  LOW: "bg-rule-strong",
};

/** The one chart on the overview: open work split by priority, with counts in text. */
export function OpenByPriorityBar({ counts }: { counts: Record<Priority, number> }) {
  const total = PRIORITY_ORDER.reduce((sum, priority) => sum + counts[priority], 0);
  return (
    <figure className="panel px-4 py-4">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="panel-title">Open work by priority</span>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{total} open</span>
      </figcaption>
      {total === 0 ? (
        <p className="text-sm text-ink-muted">Nothing open right now.</p>
      ) : (
        <>
          <div
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={PRIORITY_ORDER.map((priority) => `${PRIORITY_LABEL[priority]} ${counts[priority]}`).join(", ")}
          >
            {PRIORITY_ORDER.filter((priority) => counts[priority] > 0).map((priority) => (
              <span key={priority} className={BAR_TONE[priority]} style={{ width: `${(counts[priority] / total) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {PRIORITY_ORDER.map((priority) => (
              <li key={priority} className="flex items-center gap-2">
                <span aria-hidden className={`size-2.5 rounded-[3px] ${BAR_TONE[priority]}`} />
                <span>{PRIORITY_LABEL[priority]}</span>
                <span className="ml-auto font-mono tabular-nums sm:ml-0">{counts[priority]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
