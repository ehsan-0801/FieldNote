import { ArrowDownIcon, ArrowUpIcon, EqualsIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { Priority } from "@/generated/prisma/enums";
import { PRIORITY_LABEL } from "@/domain/priority";

const PRIORITY_STYLE: Record<Priority, { icon: Icon; className: string }> = {
  URGENT: { icon: WarningIcon, className: "text-oxide font-semibold" },
  HIGH: { icon: ArrowUpIcon, className: "text-oxide" },
  NORMAL: { icon: EqualsIcon, className: "text-ink" },
  LOW: { icon: ArrowDownIcon, className: "text-ink-muted" },
};

/** Priority shown as icon plus word, so it never depends on colour alone. */
export function PriorityLabel({ priority, unconfirmed = false }: { priority: Priority; unconfirmed?: boolean }) {
  const { icon: PriorityIcon, className } = PRIORITY_STYLE[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap">
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <PriorityIcon size={14} weight={priority === "URGENT" ? "fill" : "regular"} aria-hidden />
        {PRIORITY_LABEL[priority]}
      </span>
      {unconfirmed ? (
        <span className="rounded-[4px] bg-amber-soft px-1 py-px font-mono text-[10px] font-medium tracking-wide text-amber-ink uppercase">
          unconfirmed
        </span>
      ) : null}
    </span>
  );
}
