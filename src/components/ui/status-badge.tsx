import {
  ArchiveIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ListChecksIcon,
  PauseCircleIcon,
  SealCheckIcon,
  TrayIcon,
  WrenchIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { WorkOrderStatus } from "@/generated/prisma/enums";
import { STATUS_LABEL } from "@/domain/workflow";

const STATUS_STYLE: Record<WorkOrderStatus, { icon: Icon; className: string }> = {
  SUBMITTED: { icon: TrayIcon, className: "border-rule-strong bg-paper text-ink-muted" },
  TRIAGE: { icon: ListChecksIcon, className: "border-amber/50 bg-amber-soft text-amber-ink" },
  READY: { icon: ClipboardTextIcon, className: "border-signal/40 bg-chalk text-signal" },
  IN_PROGRESS: { icon: WrenchIcon, className: "border-signal bg-signal-soft text-signal" },
  BLOCKED: { icon: PauseCircleIcon, className: "border-oxide/50 bg-oxide-soft text-oxide" },
  RESOLVED: { icon: CheckCircleIcon, className: "border-signal/40 bg-signal-soft text-signal" },
  CLOSED: { icon: SealCheckIcon, className: "border-rule bg-paper text-ink-muted" },
  ARCHIVED: { icon: ArchiveIcon, className: "border-rule bg-paper-deep text-ink-muted" },
};

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const { icon: StatusIcon, className } = STATUS_STYLE[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-[6px] border px-2 text-xs font-medium whitespace-nowrap ${className}`}>
      <StatusIcon size={14} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
