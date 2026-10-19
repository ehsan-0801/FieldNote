import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/ui/loading-state";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, MapPinIcon, ShieldWarningIcon } from "@phosphor-icons/react/ssr";
import { NoteKind, WorkOrderStatus } from "@/generated/prisma/enums";
import { DomainError } from "@/domain/errors";
import { InlineNotice } from "@/components/ui/states";
import { PriorityLabel } from "@/components/ui/priority-label";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActivityTimeline } from "@/components/work-orders/activity-timeline";
import { AssignmentControl } from "@/components/work-orders/assignment-control";
import { DetailsEditor } from "@/components/work-orders/details-editor";
import { PriorityPanel } from "@/components/work-orders/priority-panel";
import { ProgressNoteComposer } from "@/components/work-orders/progress-note-composer";
import { StatusTransitionMenu } from "@/components/work-orders/status-transition-menu";
import { SuggestionReviewPanel } from "@/components/work-orders/suggestion-review-panel";
import { SuggestionSummary } from "@/components/work-orders/suggestion-summary";
import { formatDateTime } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { getWorkOrderDetail } from "@/server/work-orders/queries";

export const metadata: Metadata = { title: "Work order" };

const NOTE_LABEL: Record<NoteKind, string> = { COMMENT: "Comment", PROGRESS: "Progress", RESOLUTION: "Resolution" };

async function loadDetail(actor: Parameters<typeof getWorkOrderDetail>[0], id: string) {
  try {
    return await getWorkOrderDetail(actor, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

// Session-dependent content streams in behind its own boundary so client navigations stay instant.
export default function WorkOrderPage({ params, searchParams }: PageProps<"/app/work-orders/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Loading work order…" />}>
      <WorkOrderDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function WorkOrderDetail({
  params,
  searchParams,
}: {
  params: PageProps<"/app/work-orders/[id]">["params"];
  searchParams: PageProps<"/app/work-orders/[id]">["searchParams"];
}) {
  const user = await requirePageUser();
  const { id } = await params;
  const { submitted, review } = await searchParams;
  const detail = await loadDetail(user, id);
  const { workOrder, permissions, relation } = detail;
  const now = new Date();

  // Only the reporter reviews their own draft here; coordinators get the full record with history and actions.
  const inReview = workOrder.status === WorkOrderStatus.SUBMITTED && relation === "reporter" && permissions.fields.includes("title");
  const factors = {
    safetyFlag: workOrder.safetyFlag,
    essentialServiceDown: workOrder.essentialServiceDown,
    multiplePeopleAffected: workOrder.multiplePeopleAffected,
    worsening: workOrder.worsening,
  };
  const priorityMode = permissions.confirmsPriority ? "confirm" : permissions.factors ? "propose" : "view";

  return (
    <article>
      <Link
        href={relation === "reporter" ? "/app/my-work" : "/app/work-orders"}
        className="mb-2 -ml-1 inline-flex min-h-10 items-center gap-1.5 px-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon size={14} aria-hidden />
        {relation === "reporter" ? "My reports" : "Work orders"}
      </Link>

      <header className="mb-6 border-b border-rule pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2.5">
          <span className="ref text-[13px]">{workOrder.reference}</span>
          <StatusBadge status={workOrder.status} />
          <PriorityLabel priority={workOrder.priority} unconfirmed={!workOrder.priorityConfirmedAt} />
          {workOrder.safetyFlag ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-oxide">
              <ShieldWarningIcon size={14} weight="fill" aria-hidden />
              Safety flag
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] break-words">{workOrder.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
              <MapPinIcon size={14} aria-hidden />
              {workOrder.locationLabel ?? "No location given"}
            </p>
          </div>
          {!inReview ? (
            <StatusTransitionMenu
              workOrderId={workOrder.id}
              current={workOrder.status}
              options={detail.transitions}
              hasAssignee={workOrder.assigneeId !== null}
            />
          ) : null}
        </div>
      </header>

      {submitted ? (
        <div className="mb-5">
          <InlineNotice tone="success" title={`${workOrder.reference} is with the coordinators.`} live>
            You’ll see status changes and notes here as the work moves.
          </InlineNotice>
        </div>
      ) : null}

      {inReview ? (
        <>
          <div className="mb-5">
            <InlineNotice tone="warning" title="This report hasn’t reached triage yet.">
              Review the details and send it when you’re ready.
            </InlineNotice>
          </div>
          <SuggestionReviewPanel
            workOrderId={workOrder.id}
            reference={workOrder.reference}
            originalReport={workOrder.originalReport}
            initial={{
              title: workOrder.title,
              summary: workOrder.summary ?? "",
              categoryId: workOrder.categoryId ?? "",
              locationLabel: workOrder.locationLabel ?? "",
              assetLabel: workOrder.assetLabel ?? "",
              factors,
            }}
            categories={detail.categories}
            existingExtraction={detail.extraction}
            autoDraft={review === "draft" && !detail.extraction}
            focusOnMount={review !== undefined}
          />
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section className="panel" aria-labelledby="report-heading">
              <div className="panel-head">
                <h2 id="report-heading" className="panel-title">
                  Original report
                </h2>
                <span className="font-mono text-[11px] text-ink-muted">unchanged since filing</span>
              </div>
              <figure className="px-4 py-4">
                <blockquote className="text-[15px] leading-relaxed wrap-anywhere whitespace-pre-line">
                  {workOrder.originalReport}
                </blockquote>
                <figcaption className="mt-2 text-xs text-ink-muted">
                  {workOrder.reporter.name} · {formatDateTime(workOrder.createdAt)}
                </figcaption>
              </figure>
            </section>

            <section className="panel" aria-labelledby="details-heading">
              <div className="panel-head">
                <h2 id="details-heading" className="panel-title">
                  Details
                </h2>
              </div>
              <div className="px-4 py-4">
                <DetailsEditor
                  workOrderId={workOrder.id}
                  editable={permissions.fields}
                  categories={detail.categories}
                  details={{
                    title: workOrder.title,
                    summary: workOrder.summary,
                    categoryId: workOrder.categoryId,
                    categoryName: workOrder.category?.name ?? null,
                    locationLabel: workOrder.locationLabel,
                    assetLabel: workOrder.assetLabel,
                  }}
                />
              </div>
            </section>

            {workOrder.resolutionNote ? (
              <section className="panel border-signal/40" aria-labelledby="resolution-heading">
                <div className="panel-head">
                  <h2 id="resolution-heading" className="panel-title text-signal">
                    Resolution
                  </h2>
                  {workOrder.resolvedAt ? (
                    <span className="font-mono text-[11px] text-ink-muted">{formatDateTime(workOrder.resolvedAt)}</span>
                  ) : null}
                </div>
                <p className="px-4 py-4 text-sm leading-relaxed wrap-anywhere whitespace-pre-line">{workOrder.resolutionNote}</p>
              </section>
            ) : null}

            <section className="panel" aria-labelledby="notes-heading">
              <div className="panel-head">
                <h2 id="notes-heading" className="panel-title">
                  Progress notes
                </h2>
                <span className="font-mono text-[11px] text-ink-muted">{workOrder.notes.length}</span>
              </div>
              <div className="divide-y divide-rule">
                {workOrder.notes.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-ink-muted">No notes yet. Technicians and coordinators record findings here.</p>
                ) : (
                  workOrder.notes.map((note) => (
                    <div key={note.id} className="px-4 py-3.5">
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                        <span className="font-medium text-ink">{note.author.name}</span>
                        <span className={`label-mono ${note.kind === NoteKind.RESOLUTION ? "text-signal" : ""}`}>
                          {NOTE_LABEL[note.kind]}
                        </span>
                        <time dateTime={note.createdAt.toISOString()} className="font-mono">
                          {formatDateTime(note.createdAt)}
                        </time>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed wrap-anywhere whitespace-pre-line">{note.body}</p>
                    </div>
                  ))
                )}
              </div>
              {detail.noteKinds.length > 0 ? (
                <div className="border-t border-rule px-4 py-4">
                  <ProgressNoteComposer workOrderId={workOrder.id} kinds={detail.noteKinds} />
                </div>
              ) : null}
            </section>
          </div>

          <aside className="space-y-5" aria-label="Work order facts">
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Owner</h2>
              </div>
              <div className="px-4 py-4">
                <AssignmentControl
                  workOrderId={workOrder.id}
                  assignee={workOrder.assignee}
                  technicians={detail.technicians}
                  canAssign={permissions.assign}
                />
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Priority</h2>
              </div>
              <div className="px-4 py-4">
                <PriorityPanel
                  workOrderId={workOrder.id}
                  priority={workOrder.priority}
                  rationale={workOrder.priorityRationale}
                  factors={factors}
                  confirmedAt={workOrder.priorityConfirmedAt}
                  evidence={detail.extraction?.suggestion.signals ?? []}
                  mode={priorityMode}
                />
              </div>
            </section>

            {detail.extraction && relation === "manager" ? (
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Draft suggestion</h2>
                </div>
                <div className="px-4 py-4">
                  <SuggestionSummary extraction={detail.extraction} />
                </div>
              </section>
            ) : null}

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Timeline</h2>
                <span className="font-mono text-[11px] text-ink-muted">append-only</span>
              </div>
              <div className="px-4 py-4">
                <ActivityTimeline events={detail.timeline} now={now} />
              </div>
              <dl className="grid grid-cols-2 gap-3 border-t border-rule px-4 py-3 text-xs">
                <div>
                  <dt className="label-mono">Reported</dt>
                  <dd className="mt-0.5 font-mono">{formatDateTime(workOrder.createdAt)}</dd>
                </div>
                <div>
                  <dt className="label-mono">Updated</dt>
                  <dd className="mt-0.5 font-mono">{formatDateTime(workOrder.updatedAt)}</dd>
                </div>
                {workOrder.closedAt ? (
                  <div>
                    <dt className="label-mono">Closed</dt>
                    <dd className="mt-0.5 font-mono">{formatDateTime(workOrder.closedAt)}</dd>
                  </div>
                ) : null}
                {workOrder.archivedAt ? (
                  <div>
                    <dt className="label-mono">Archived</dt>
                    <dd className="mt-0.5 font-mono">{formatDateTime(workOrder.archivedAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </aside>
        </div>
      )}
    </article>
  );
}
