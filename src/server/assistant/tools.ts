import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/domain/access";
import { summarizeWorkload, workloadScope, type AssistantStep, type WorkloadScope } from "@/domain/assistant";
import { auditActionLabel } from "@/domain/audit-actions";
import { workOrderListQuerySchema } from "@/domain/schemas";
import { OPEN_STATUSES } from "@/domain/workflow";
import { describeAuditDetails } from "@/lib/audit-describe";
import { redactContactDetails } from "../ai/redact";
import { listActivity } from "../audit-log";
import { db } from "../db";
import { getDashboardSummary, getWorkOrderDetail, listActiveCategories, listWorkOrders } from "../work-orders/queries";
import { visibleWorkOrdersWhere } from "../work-orders/scope";

const MAX_RESULT_CHARS = 6000;

function toResult(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…(truncated)` : text;
}

const asStatus = (value: string): WorkOrderStatus | undefined =>
  Object.values(WorkOrderStatus).find((status) => status === value.trim().toUpperCase());

const ACTIVITY_LIMIT = 20;
const LIST_LIMIT = 10;

const briefSelect = {
  reference: true,
  title: true,
  status: true,
  priority: true,
  safetyFlag: true,
  locationLabel: true,
  updatedAt: true,
  assignee: { select: { name: true } },
} satisfies Prisma.WorkOrderSelect;

type BriefRow = Prisma.WorkOrderGetPayload<{ select: typeof briefSelect }>;

const brief = (row: BriefRow) => ({
  reference: row.reference,
  title: redactContactDetails(row.title),
  status: row.status,
  priority: row.priority,
  safetyFlag: row.safetyFlag,
  location: row.locationLabel ? redactContactDetails(row.locationLabel) : null,
  owner: row.assignee?.name ?? null,
  updatedAt: row.updatedAt.toISOString(),
});

const isOpen: Prisma.WorkOrderWhereInput = { status: { in: [...OPEN_STATUSES] } };

/** Narrows (never widens) the visible set to the actor's own workload. */
function workloadWhere(actor: Actor, scope: WorkloadScope): Prisma.WorkOrderWhereInput {
  const own: Prisma.WorkOrderWhereInput =
    scope === "assignedToMe" ? { assigneeId: actor.id } : scope === "reportedByMe" ? { reporterId: actor.id } : {};
  return { AND: [visibleWorkOrdersWhere(actor), own, isOpen] };
}

/** Names for owner IDs, limited to the actor's workspace. */
async function ownerNames(actor: Actor, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: ids }, workspaceId: actor.workspaceId }, select: { id: true, name: true } });
  return new Map(users.map((user) => [user.id, user.name]));
}

async function myWorkOrders(actor: Actor, statusText: string) {
  const status = asStatus(statusText);
  const statusFilter: Prisma.WorkOrderWhereInput = status ? { status } : { status: { not: WorkOrderStatus.ARCHIVED } };
  const list = async (mine: Prisma.WorkOrderWhereInput) => {
    const where: Prisma.WorkOrderWhereInput = { AND: [visibleWorkOrdersWhere(actor), mine, statusFilter] };
    const [total, rows] = await Promise.all([
      db.workOrder.count({ where }),
      db.workOrder.findMany({ where, select: briefSelect, orderBy: [{ priority: "desc" }, { updatedAt: "desc" }], take: LIST_LIMIT }),
    ]);
    return { total, showing: rows.length, results: rows.map(brief) };
  };
  const [assignedToMe, reportedByMe] = await Promise.all([list({ assigneeId: actor.id }), list({ reporterId: actor.id })]);
  return { statusFilter: status ?? "all except archived", assignedToMe, reportedByMe };
}

async function workload(actor: Actor) {
  const scope = workloadScope(actor.role);
  const where = workloadWhere(actor, scope);
  const [groups, oldest] = await Promise.all([
    db.workOrder.groupBy({ by: ["status", "assigneeId"], where, _count: { _all: true } }),
    db.workOrder.findMany({ where, select: briefSelect, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: LIST_LIMIT }),
  ]);
  const names = await ownerNames(actor, [...new Set(groups.flatMap((group) => (group.assigneeId ? [group.assigneeId] : [])))]);
  const summary = summarizeWorkload(
    groups.map((group) => ({
      status: group.status,
      ownerName: group.assigneeId ? (names.get(group.assigneeId) ?? "Unknown") : null,
      count: group._count._all,
    })),
  );
  return { scope, openTotal: summary.total, openByStatus: summary.byStatus, openByOwner: summary.byOwner, mostPressing: oldest.map(brief) };
}

async function categoriesWithCounts(actor: Actor) {
  const [categories, counts] = await Promise.all([
    listActiveCategories(actor),
    // Counts cover only work this person can see, so they reveal nothing about other people's reports.
    db.workOrder.groupBy({ by: ["categoryId"], where: { AND: [visibleWorkOrdersWhere(actor), isOpen] }, _count: { _all: true } }),
  ]);
  const open = new Map(counts.map((row) => [row.categoryId, row._count._all]));
  return {
    openCountsCover: workloadScope(actor.role) === "workspace" ? "whole workspace" : "work this person can see",
    categories: categories.map((category) => ({ name: category.name, openWorkOrders: open.get(category.id) ?? 0 })),
    uncategorisedOpen: open.get(null) ?? 0,
  };
}

async function recentActivity(actor: Actor) {
  const activity = await listActivity(actor, 1, ACTIVITY_LIMIT);
  const references: Record<string, { reference: string; title: string }> = activity.references;
  return {
    totalEvents: activity.total,
    showing: activity.events.length,
    events: activity.events.map((event) => {
      const detail = describeAuditDetails(event.action, event.details);
      const workOrder = event.entityType === "WorkOrder" ? references[event.entityId] : undefined;
      return {
        at: event.createdAt.toISOString(),
        by: event.actor?.name ?? "System",
        what: auditActionLabel(event.action),
        detail: detail ? redactContactDetails(detail) : null,
        reference: workOrder?.reference ?? null,
        title: workOrder ? redactContactDetails(workOrder.title) : null,
      };
    }),
  };
}

export const normalizeReference = (value: string) => value.trim().toUpperCase();

/** Finds a work order by reference among those the actor may open; never reveals others. */
export async function findVisibleByReference(actor: Actor, reference: string) {
  return db.workOrder.findFirst({
    where: { AND: [visibleWorkOrdersWhere(actor), { reference: normalizeReference(reference) }] },
    select: { id: true, reference: true, workspaceId: true, reporterId: true, assigneeId: true, status: true },
  });
}

/**
 * Executes one read-only lookup for the model. Every tool goes through the same
 * scoped services as the UI, so results never exceed what the person can see.
 * Report and note text is redacted before it leaves the server.
 */
export async function runAssistantTool(actor: Actor, step: AssistantStep): Promise<string> {
  switch (step.tool) {
    case "search_work_orders": {
      const query = workOrderListQuerySchema.parse({ q: step.query.trim() || undefined, status: asStatus(step.status), pageSize: "10" });
      const result = await listWorkOrders(actor, query);
      return toResult({
        total: result.total,
        showing: result.items.length,
        results: result.items.map((item) => ({
          reference: item.reference,
          title: item.title,
          status: item.status,
          priority: item.priority,
          priorityConfirmed: Boolean(item.priorityConfirmedAt),
          safetyFlag: item.safetyFlag,
          location: item.locationLabel,
          category: item.category?.name ?? null,
          owner: item.assignee?.name ?? null,
          updatedAt: item.updatedAt.toISOString(),
        })),
      });
    }
    case "get_work_order": {
      const found = step.reference ? await findVisibleByReference(actor, step.reference) : null;
      if (!found) return toResult({ error: "No work order with that reference that this person can open." });
      const detail = await getWorkOrderDetail(actor, found.id);
      const { workOrder } = detail;
      return toResult({
        reference: workOrder.reference,
        title: workOrder.title,
        status: workOrder.status,
        priority: workOrder.priority,
        priorityConfirmed: Boolean(workOrder.priorityConfirmedAt),
        priorityRationale: workOrder.priorityRationale,
        safetyFlag: workOrder.safetyFlag,
        category: workOrder.category?.name ?? null,
        location: workOrder.locationLabel,
        asset: workOrder.assetLabel,
        reporter: workOrder.reporter.name,
        owner: workOrder.assignee?.name ?? null,
        originalReport: redactContactDetails(workOrder.originalReport),
        summary: workOrder.summary ? redactContactDetails(workOrder.summary) : null,
        resolutionNote: workOrder.resolutionNote ? redactContactDetails(workOrder.resolutionNote) : null,
        createdAt: workOrder.createdAt.toISOString(),
        recentNotes: workOrder.notes.slice(-5).map((note) => ({
          by: note.author.name,
          kind: note.kind,
          at: note.createdAt.toISOString(),
          text: redactContactDetails(note.body),
        })),
        recentHistory: detail.timeline.slice(-8).map((event) => ({
          by: event.actor?.name ?? "System",
          what: auditActionLabel(event.action),
          detail: describeAuditDetails(event.action, event.details),
          at: event.createdAt.toISOString(),
        })),
        whatThisPersonCanDo: {
          statusChanges: detail.transitions.map((transition) => `${transition.label} (→ ${transition.to})`),
          canAssign: detail.permissions.assign,
          canAddNotes: detail.noteKinds.length > 0,
        },
      });
    }
    case "get_overview": {
      const summary = await getDashboardSummary(actor);
      return toResult({
        ...summary.metrics,
        openByPriority: summary.openByPriority,
        waitingForDecision: summary.decisions.map((item) => `${item.reference} ${item.title}`),
        myQueue: summary.myQueue.map((item) => `${item.reference} ${item.title}`),
      });
    }
    case "list_technicians": {
      if (actor.role !== Role.ADMIN && actor.role !== Role.COORDINATOR) {
        return toResult({ error: "Only coordinators and administrators can see or assign technicians." });
      }
      const technicians = await db.user.findMany({
        where: { workspaceId: actor.workspaceId, role: Role.TECHNICIAN, isActive: true },
        select: {
          name: true,
          _count: { select: { assignedWorkOrders: { where: { status: { in: ["READY", "IN_PROGRESS", "BLOCKED"] } } } } },
        },
        orderBy: { name: "asc" },
      });
      return toResult(technicians.map((technician) => ({ name: technician.name, openAssignments: technician._count.assignedWorkOrders })));
    }
    case "list_categories":
      return toResult(await categoriesWithCounts(actor));
    case "recent_activity":
      return toResult(await recentActivity(actor));
    case "workload":
      return toResult(await workload(actor));
    case "my_work_orders":
      return toResult(await myWorkOrders(actor, step.status));
    case "none":
      return toResult({ error: "No tool was named." });
  }
}
