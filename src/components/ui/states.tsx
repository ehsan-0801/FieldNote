import type { ReactNode } from "react";
import { CheckCircleIcon, InfoIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

/** Designed empty state: says what is empty, why that might be, and what to do next. */
export function EmptyState({
  icon: StateIcon,
  title,
  children,
  action,
}: {
  icon: Icon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-5 py-10 sm:items-center sm:text-center">
      <span className="grid size-10 place-items-center rounded-[10px] border border-dashed border-rule-strong text-ink-muted">
        <StateIcon size={20} aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {children ? <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="panel flex flex-col items-start gap-3 border-oxide/40 px-5 py-6">
      <div className="flex items-center gap-2 text-oxide">
        <WarningOctagonIcon size={20} aria-hidden />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {children ? <div className="text-sm text-ink-muted">{children}</div> : null}
      {action}
    </div>
  );
}

const NOTICE_TONE: Record<"info" | "warning" | "danger" | "success", { icon: Icon; className: string }> = {
  info: { icon: InfoIcon, className: "border-rule-strong bg-paper text-ink" },
  warning: { icon: WarningIcon, className: "border-amber/50 bg-amber-soft text-amber-ink" },
  danger: { icon: WarningOctagonIcon, className: "border-oxide/40 bg-oxide-soft text-oxide" },
  success: { icon: CheckCircleIcon, className: "border-signal/40 bg-signal-soft text-signal" },
};

export function InlineNotice({
  tone = "info",
  title,
  children,
  live = false,
}: {
  tone?: keyof typeof NOTICE_TONE;
  title?: string;
  children?: ReactNode;
  /** Announce to screen readers when the notice appears after an async action. */
  live?: boolean;
}) {
  const { icon: ToneIcon, className } = NOTICE_TONE[tone];
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={`flex gap-2.5 rounded-control border px-3 py-2.5 text-sm ${className}`}
    >
      <ToneIcon size={18} className="mt-px shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5 text-ink-muted" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}
