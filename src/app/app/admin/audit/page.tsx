import type { Metadata } from "next";
import Link from "next/link";
import { ScrollIcon } from "@phosphor-icons/react/ssr";
import { AdminOnly } from "@/components/admin/admin-only";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Pagination } from "@/components/work-orders/pagination";
import { canManageWorkspace } from "@/domain/access";
import { AUDIT_ACTIONS, auditActionLabel } from "@/domain/audit-actions";
import { auditQuerySchema } from "@/domain/schemas";
import { describeAuditDetails } from "@/lib/audit-describe";
import { formatDateTime } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { listAuditLog } from "@/server/audit-log";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/app/admin/audit">) {
  const user = await requirePageUser();
  if (!canManageWorkspace(user)) return <AdminOnly />;
  const parsed = auditQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : auditQuerySchema.parse({});
  const [log, people] = await Promise.all([
    listAuditLog(user, query),
    db.user.findMany({ where: { workspaceId: user.workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const filtered = Boolean(query.action || query.actor || query.entity);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of every security-relevant change in this workspace. Entries can’t be edited or deleted."
      />
      <form action="/app/admin/audit" className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="audit-action" className="field-label">
            Action
          </label>
          <select id="audit-action" name="action" defaultValue={query.action ?? ""} className="input">
            <option value="">Any action</option>
            {Object.keys(AUDIT_ACTIONS).map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-actor" className="field-label">
            Person
          </label>
          <select id="audit-actor" name="actor" defaultValue={query.actor ?? ""} className="input">
            <option value="">Anyone</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-entity" className="field-label">
            Record type
          </label>
          <select id="audit-entity" name="entity" defaultValue={query.entity ?? ""} className="input">
            <option value="">Any</option>
            <option value="WorkOrder">Work orders</option>
            <option value="User">People</option>
            <option value="Category">Categories</option>
            <option value="Session">Sign-ins</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            Apply
          </button>
          {filtered ? (
            <Link href="/app/admin/audit" className="btn btn-secondary">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <section className="panel overflow-x-auto">
        {log.events.length === 0 ? (
          <EmptyState icon={ScrollIcon} title={filtered ? "No entries match these filters." : "No audit entries yet."} />
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-rule">
                {["When", "Who", "Action", "Record", "Detail"].map((heading) => (
                  <th key={heading} scope="col" className="label-mono px-4 py-2.5 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.events.map((event) => {
                const target = event.entityType === "WorkOrder" ? log.references[event.entityId] : undefined;
                return (
                  <tr key={event.id} className="border-b border-rule align-top last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-ink-muted">{formatDateTime(event.createdAt)}</td>
                    <td className="px-4 py-2.5">{event.actor?.name ?? "System"}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs">{event.action}</span>
                      <span className="block text-xs text-ink-muted">{auditActionLabel(event.action)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {target ? (
                        <Link href={`/app/work-orders/${event.entityId}`} className="link font-mono text-xs">
                          {target.reference}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-ink-muted">{event.entityType}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px]">
                      {describeAuditDetails(event.action, event.details) ?? <span className="text-ink-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination
          basePath="/app/admin/audit"
          searchParams={{ action: query.action, actor: query.actor, entity: query.entity }}
          page={log.page}
          pageCount={log.pageCount}
          total={log.total}
          pageSize={40}
          noun={["entry", "entries"]}
        />
      </section>
    </>
  );
}
