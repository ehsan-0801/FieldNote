import Link from "next/link";
import { auditActionLabel } from "@/domain/audit-actions";
import { describeAuditDetails } from "@/lib/audit-describe";
import { formatAge, formatDateTime } from "@/lib/format";

export interface TimelineEvent {
  id: string;
  action: string;
  details: unknown;
  createdAt: Date;
  actor: { name: string } | null;
  entityId?: string;
  entityType?: string;
}

/**
 * Append-only history. Each row: who, what, when, and a one-line detail.
 * When `references` is given the row also links to its work order (activity streams).
 */
export function ActivityTimeline({
  events,
  references,
  now = new Date(),
}: {
  events: TimelineEvent[];
  references?: Record<string, { reference: string; title: string }>;
  now?: Date;
}) {
  return (
    <ol className="relative">
      {events.map((event, index) => {
        const detail = describeAuditDetails(event.action, event.details);
        const target = references && event.entityType === "WorkOrder" && event.entityId ? references[event.entityId] : undefined;
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            <span aria-hidden className="relative flex w-3 shrink-0 justify-center">
              <span className="mt-1.5 size-2 rounded-full border border-signal bg-chalk" />
              {index < events.length - 1 ? <span className="absolute top-4 bottom-[-2px] w-px bg-rule" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug">
                <span className="font-medium">{event.actor?.name ?? "System"}</span>{" "}
                <span className="text-ink-muted">{auditActionLabel(event.action)}</span>
                {target ? (
                  <>
                    {" on "}
                    <Link href={`/app/work-orders/${event.entityId}`} className="link">
                      <span className="font-mono text-[12px]">{target.reference}</span>
                    </Link>
                  </>
                ) : null}
              </p>
              {detail ? <p className="mt-0.5 text-[13px] break-words text-ink">{detail}</p> : null}
              {target ? <p className="truncate text-xs text-ink-muted">{target.title}</p> : null}
              <time
                dateTime={event.createdAt.toISOString()}
                title={formatDateTime(event.createdAt)}
                className="mt-0.5 block font-mono text-[11px] text-ink-muted"
              >
                {formatAge(event.createdAt, now)} · {formatDateTime(event.createdAt)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
