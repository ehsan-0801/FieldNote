import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRightIcon, CheckCircleIcon, ClockCounterClockwiseIcon, PlusIcon, WrenchIcon } from "@phosphor-icons/react/ssr";
import { Role } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { ActivityTimeline } from "@/components/work-orders/activity-timeline";
import { MetricStrip, OpenByPriorityBar } from "@/components/work-orders/metric-strip";
import { WorkOrderTable } from "@/components/work-orders/work-order-table";
import { formatDate } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { listActivity } from "@/server/audit-log";
import { getDashboardSummary, listWorkOrders } from "@/server/work-orders/queries";
import { workOrderListQuerySchema } from "@/domain/schemas";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const user = await requirePageUser();
  const now = new Date();
  const isManager = user.role === Role.ADMIN || user.role === Role.COORDINATOR;
  const [summary, activity, recentReports] = await Promise.all([
    getDashboardSummary(user, now),
    listActivity(user, 1),
    user.role === Role.REPORTER ? listWorkOrders(user, workOrderListQuerySchema.parse({ pageSize: "10" })) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={`${user.workspaceName} · ${formatDate(now)}`}
        title="Operations overview"
        actions={
          <Link href="/app/work-orders/new" className="btn btn-primary">
            <PlusIcon size={16} aria-hidden />
            New report
          </Link>
        }
      />
      <div className="space-y-6">
        <MetricStrip metrics={summary.metrics} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            {isManager ? (
              <section className="panel overflow-hidden" aria-labelledby="decisions-heading">
                <div className="panel-head">
                  <h2 id="decisions-heading" className="panel-title">
                    Needs a decision
                  </h2>
                  <Link
                    href="/app/work-orders?status=TRIAGE"
                    className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
                  >
                    All in triage <ArrowUpRightIcon size={12} aria-hidden />
                  </Link>
                </div>
                {summary.decisions.length ? (
                  <WorkOrderTable items={summary.decisions} now={now} />
                ) : (
                  <EmptyState icon={CheckCircleIcon} title="Nothing is waiting on triage or an owner.">
                    New reports land here once their reporter sends them.
                  </EmptyState>
                )}
              </section>
            ) : null}

            {user.role === Role.TECHNICIAN ? (
              <section className="panel overflow-hidden" aria-labelledby="queue-heading">
                <div className="panel-head">
                  <h2 id="queue-heading" className="panel-title">
                    My queue
                  </h2>
                  <Link href="/app/my-work" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                    All my work <ArrowUpRightIcon size={12} aria-hidden />
                  </Link>
                </div>
                {summary.myQueue.length ? (
                  <WorkOrderTable items={summary.myQueue} now={now} />
                ) : (
                  <EmptyState icon={WrenchIcon} title="Nothing assigned to you right now.">
                    Coordinators assign work after triage. It will appear here.
                  </EmptyState>
                )}
              </section>
            ) : null}

            {recentReports ? (
              <section className="panel overflow-hidden" aria-labelledby="reports-heading">
                <div className="panel-head">
                  <h2 id="reports-heading" className="panel-title">
                    Your reports
                  </h2>
                  <Link href="/app/my-work" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                    All reports <ArrowUpRightIcon size={12} aria-hidden />
                  </Link>
                </div>
                {recentReports.items.length ? (
                  <WorkOrderTable items={recentReports.items} now={now} />
                ) : (
                  <EmptyState
                    icon={PlusIcon}
                    title="You haven’t reported anything yet."
                    action={
                      <Link href="/app/work-orders/new" className="btn btn-primary">
                        Report an issue
                      </Link>
                    }
                  >
                    Spotted something broken? A sentence is enough to start.
                  </EmptyState>
                )}
              </section>
            ) : null}

            <OpenByPriorityBar counts={summary.openByPriority} />
          </div>

          <section className="panel self-start" aria-labelledby="movement-heading">
            <div className="panel-head">
              <h2 id="movement-heading" className="panel-title">
                Recent movement
              </h2>
              <Link href="/app/activity" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                Full activity <ArrowUpRightIcon size={12} aria-hidden />
              </Link>
            </div>
            <div className="px-4 py-4">
              {activity.events.length ? (
                <ActivityTimeline events={activity.events.slice(0, 8)} references={activity.references} now={now} />
              ) : (
                <EmptyState icon={ClockCounterClockwiseIcon} title="No activity yet." />
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
