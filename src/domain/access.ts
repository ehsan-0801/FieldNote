import { NoteKind, Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { FROZEN_STATUSES, checkTransition, type TransitionCheck } from "./workflow";

export interface Actor {
  id: string;
  workspaceId: string;
  role: Role;
}

export interface WorkOrderAccessFacts {
  workspaceId: string;
  reporterId: string;
  assigneeId: string | null;
  status: WorkOrderStatus;
}

/**
 * How the actor relates to one work order. Every object-level decision derives
 * from this, so role and ownership are always evaluated together.
 * - manager: admin or coordinator in the same workspace
 * - assignee: the technician currently assigned
 * - reporter: the person who filed it (a technician who filed a report is a reporter on it)
 */
export type WorkOrderRelation = "manager" | "assignee" | "reporter";

export function relationTo(actor: Actor, workOrder: WorkOrderAccessFacts): WorkOrderRelation | null {
  if (actor.workspaceId !== workOrder.workspaceId) return null;
  if (actor.role === Role.ADMIN || actor.role === Role.COORDINATOR) return "manager";
  if (actor.role === Role.TECHNICIAN && workOrder.assigneeId === actor.id) return "assignee";
  if (workOrder.reporterId === actor.id) return "reporter";
  return null;
}

export function canViewWorkOrder(actor: Actor, workOrder: WorkOrderAccessFacts): boolean {
  return relationTo(actor, workOrder) !== null;
}

/** Which rows a list query may return; translated to a Prisma filter by the service. */
export type VisibilityScope = "workspace" | "assignedOrReported" | "reported";

export function visibilityScope(role: Role): VisibilityScope {
  if (role === Role.ADMIN || role === Role.COORDINATOR) return "workspace";
  if (role === Role.TECHNICIAN) return "assignedOrReported";
  return "reported";
}

export const EDITABLE_DETAIL_FIELDS = ["title", "summary", "categoryId", "locationLabel", "assetLabel"] as const;
export type EditableDetailField = (typeof EDITABLE_DETAIL_FIELDS)[number];

export interface EditPermissions {
  fields: readonly EditableDetailField[];
  /** May set priority factors. Managers' changes confirm priority; a reporter's are a proposal. */
  factors: boolean;
  confirmsPriority: boolean;
  assign: boolean;
}

const NO_EDITS: EditPermissions = { fields: [], factors: false, confirmsPriority: false, assign: false };

export function editPermissions(actor: Actor, workOrder: WorkOrderAccessFacts): EditPermissions {
  const relation = relationTo(actor, workOrder);
  if (!relation || FROZEN_STATUSES.includes(workOrder.status)) return NO_EDITS;

  switch (relation) {
    case "manager":
      return { fields: EDITABLE_DETAIL_FIELDS, factors: true, confirmsPriority: true, assign: true };
    case "assignee":
      // Technicians correct on-site facts; triage decisions stay with coordinators.
      return { fields: ["summary", "locationLabel", "assetLabel"], factors: false, confirmsPriority: false, assign: false };
    case "reporter":
      // Reporters review the AI draft of their own report until it enters triage.
      return workOrder.status === WorkOrderStatus.SUBMITTED
        ? { fields: EDITABLE_DETAIL_FIELDS, factors: true, confirmsPriority: false, assign: false }
        : NO_EDITS;
  }
}

export function canAssignWorkOrder(actor: Actor, workOrder: WorkOrderAccessFacts): boolean {
  return editPermissions(actor, workOrder).assign;
}

export function canEditWorkOrder(actor: Actor, workOrder: WorkOrderAccessFacts): boolean {
  const permissions = editPermissions(actor, workOrder);
  return permissions.fields.length > 0 || permissions.factors || permissions.assign;
}

export interface StatusChangeRequest {
  to: WorkOrderStatus;
  reason?: string | null;
  resolutionNote?: string | null;
}

export function canTransitionStatus(actor: Actor, workOrder: WorkOrderAccessFacts, request: StatusChangeRequest): TransitionCheck {
  const relation = relationTo(actor, workOrder);
  const forbidden: TransitionCheck = {
    ok: false,
    code: "FORBIDDEN",
    message: "You can’t change the status of this work order.",
  };
  if (!relation) return forbidden;
  // A reporter's only status move is confirming their own report into triage.
  if (relation === "reporter" && !(workOrder.status === WorkOrderStatus.SUBMITTED && request.to === WorkOrderStatus.TRIAGE)) {
    return forbidden;
  }
  return checkTransition({
    from: workOrder.status,
    to: request.to,
    role: relation === "reporter" ? Role.REPORTER : actor.role,
    hasAssignee: workOrder.assigneeId !== null,
    reason: request.reason,
    resolutionNote: request.resolutionNote,
  });
}

export function allowedNoteKinds(actor: Actor, workOrder: WorkOrderAccessFacts): NoteKind[] {
  const relation = relationTo(actor, workOrder);
  if (!relation || workOrder.status === WorkOrderStatus.ARCHIVED) return [];
  // Resolution notes are only written through the RESOLVED transition.
  return relation === "reporter" ? [NoteKind.COMMENT] : [NoteKind.COMMENT, NoteKind.PROGRESS];
}

export function canManageWorkspace(actor: Actor): boolean {
  return actor.role === Role.ADMIN;
}

/**
 * Audit visibility inside the actor's workspace:
 * - workspace: everything, including user and role changes (admin)
 * - workOrders: all work-order and category history, no account administration (coordinator)
 * - visibleWorkOrders: history of the work orders this person can open (technician, reporter)
 */
export type AuditScope = "workspace" | "workOrders" | "visibleWorkOrders";

export function auditScope(role: Role): AuditScope {
  if (role === Role.ADMIN) return "workspace";
  if (role === Role.COORDINATOR) return "workOrders";
  return "visibleWorkOrders";
}
