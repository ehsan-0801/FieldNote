import Link from "next/link";
import { MapPinIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import type { WorkOrderListItem } from "@/server/work-orders/queries";
import { formatAge, formatDateTime } from "@/lib/format";
import { PriorityLabel } from "../ui/priority-label";
import { StatusBadge } from "../ui/status-badge";

function Owner({ assignee }: { assignee: WorkOrderListItem["assignee"] }) {
  return assignee ? <span>{assignee.name}</span> : <span className="text-amber-ink italic">Unassigned</span>;
}

function SafetyMark() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-oxide">
      <ShieldWarningIcon size={13} weight="fill" aria-hidden />
      Safety flag
    </span>
  );
}

/**
 * Dense table when its container is wide, stacked rows when it isn't. Container
 * queries (not viewport breakpoints) keep it readable inside narrower panels too.
 */
export function WorkOrderTable({ items, now = new Date() }: { items: WorkOrderListItem[]; now?: Date }) {
  return (
    <div className="@container">
      <table className="hidden w-full border-collapse text-left text-sm @3xl:table">
        <caption className="sr-only">Work orders</caption>
        <thead>
          <tr className="border-b border-rule">
            {["Reference", "Issue", "Location", "Priority", "Status", "Owner", "Updated"].map((heading) => (
              <th key={heading} scope="col" className="label-mono px-3 py-2.5 font-medium first:pl-4 last:pr-4">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="group relative border-b border-rule last:border-b-0 hover:bg-paper/70">
              <td className="py-3 pr-3 pl-4 align-top">
                <span className="ref">{item.reference}</span>
              </td>
              <td className="max-w-[28rem] px-3 py-3 align-top">
                <Link
                  href={`/app/work-orders/${item.id}`}
                  className="font-medium text-ink after:absolute after:inset-0 group-hover:underline"
                >
                  {item.title}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  <span>{item.category?.name ?? "Uncategorised"}</span>
                  {item.safetyFlag ? <SafetyMark /> : null}
                </div>
              </td>
              <td className="px-3 py-3 align-top text-ink-muted">{item.locationLabel ?? "—"}</td>
              <td className="px-3 py-3 align-top">
                <PriorityLabel priority={item.priority} unconfirmed={!item.priorityConfirmedAt} />
              </td>
              <td className="px-3 py-3 align-top">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-3 py-3 align-top">
                <Owner assignee={item.assignee} />
              </td>
              <td className="py-3 pr-4 pl-3 align-top whitespace-nowrap">
                <time
                  dateTime={item.updatedAt.toISOString()}
                  title={formatDateTime(item.updatedAt)}
                  className="font-mono text-xs text-ink-muted"
                >
                  {formatAge(item.updatedAt, now)}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-rule @3xl:hidden">
        {items.map((item) => (
          <li key={item.id} className="relative px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className="ref">{item.reference}</span>
              <StatusBadge status={item.status} />
            </div>
            <Link href={`/app/work-orders/${item.id}`} className="mt-1.5 block font-medium after:absolute after:inset-0">
              {item.title}
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <PriorityLabel priority={item.priority} unconfirmed={!item.priorityConfirmedAt} />
              {item.locationLabel ? (
                <span className="inline-flex items-center gap-1">
                  <MapPinIcon size={13} aria-hidden />
                  {item.locationLabel}
                </span>
              ) : null}
              <Owner assignee={item.assignee} />
              {item.safetyFlag ? <SafetyMark /> : null}
              <span className="font-mono">{formatAge(item.updatedAt, now)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
