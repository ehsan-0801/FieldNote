import "server-only";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import type { Actor } from "@/domain/access";
import type { AssistantStep } from "@/domain/assistant";
import { auditActionLabel } from "@/domain/audit-actions";
import { workOrderListQuerySchema } from "@/domain/schemas";
import { describeAuditDetails } from "@/lib/audit-describe";
import { redactContactDetails } from "../ai/redact";
import { db } from "../db";
import { getDashboardSummary, getWorkOrderDetail, listWorkOrders } from "../work-orders/queries";
import { visibleWorkOrdersWhere } from "../work-orders/scope";

const MAX_RESULT_CHARS = 6000;

function toResult(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…(truncated)` : text;
}

const asStatus = (value: string): WorkOrderStatus | undefined =>
  Object.values(WorkOrderStatus).find((status) => status === value.trim().toUpperCase());

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
    case "none":
      return toResult({ error: "No tool was named." });
  }
}
