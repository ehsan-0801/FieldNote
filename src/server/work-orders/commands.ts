import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { NoteKind, Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { EDITABLE_DETAIL_FIELDS, allowedNoteKinds, canTransitionStatus, editPermissions, type EditableDetailField } from "@/domain/access";
import { draftTitle } from "@/domain/drafting";
import { DomainError } from "@/domain/errors";
import { NO_FACTORS, PRIORITY_FACTORS, assessPriority, type PriorityFactorValues } from "@/domain/priority";
import type { CreateWorkOrderInput, NoteInput, TransitionInput, UpdateWorkOrderInput } from "@/domain/schemas";
import { recordAudit } from "../audit";
import { db, type Tx } from "../db";
import type { ActorContext } from "../request-context";
import { loadVisibleWorkOrder } from "./scope";

const REFERENCE_ATTEMPTS = 3;

function auditBase(ctx: ActorContext, workOrderId: string) {
  return {
    workspaceId: ctx.actor.workspaceId,
    actorId: ctx.actor.id,
    entityType: "WorkOrder" as const,
    entityId: workOrderId,
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
  };
}

/** Saves the original report before anything else happens, so AI trouble can never lose it. */
export async function createWorkOrder(ctx: ActorContext, input: CreateWorkOrderInput) {
  const assessment = assessPriority(NO_FACTORS);
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        // The row lock on the workspace serialises reference numbers per workspace.
        const counter = await tx.workspace.update({
          where: { id: ctx.actor.workspaceId },
          data: { nextReferenceNumber: { increment: 1 } },
          select: { nextReferenceNumber: true },
        });
        const workOrder = await tx.workOrder.create({
          data: {
            reference: `WO-${counter.nextReferenceNumber - 1}`,
            workspaceId: ctx.actor.workspaceId,
            reporterId: ctx.actor.id,
            title: draftTitle(input.originalReport),
            originalReport: input.originalReport,
            locationLabel: input.locationLabel ?? null,
            assetLabel: input.assetLabel ?? null,
            priority: assessment.priority,
            priorityRationale: assessment.rationale,
          },
          select: { id: true, reference: true, status: true },
        });
        await tx.statusEvent.create({
          data: { workOrderId: workOrder.id, actorId: ctx.actor.id, fromStatus: null, toStatus: WorkOrderStatus.SUBMITTED },
        });
        await recordAudit(tx, {
          ...auditBase(ctx, workOrder.id),
          action: "work_order.created",
          details: { reference: workOrder.reference, reportLength: input.originalReport.length },
        });
        return workOrder;
      });
    } catch (error) {
      const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!collision || attempt >= REFERENCE_ATTEMPTS) throw error;
    }
  }
}

async function assertCategoryInWorkspace(tx: Tx, workspaceId: string, categoryId: string) {
  const category = await tx.category.findFirst({ where: { id: categoryId, workspaceId, isActive: true }, select: { id: true } });
  if (!category) {
    throw new DomainError("VALIDATION_ERROR", "Choose a category from this workspace.", { categoryId: ["Unknown category."] });
  }
}

async function loadAssignableTechnician(tx: Tx, workspaceId: string, userId: string) {
  const technician = await tx.user.findFirst({
    where: { id: userId, workspaceId, isActive: true, role: Role.TECHNICIAN },
    select: { id: true, name: true },
  });
  if (!technician) {
    throw new DomainError("VALIDATION_ERROR", "Choose an active technician from this workspace.", {
      assigneeId: ["Not an assignable technician."],
    });
  }
  return technician;
}

const NULLABLE_DETAIL_FIELDS = ["summary", "categoryId", "locationLabel", "assetLabel"] as const satisfies readonly EditableDetailField[];

/**
 * Applies an allow-listed edit. Each requested field is checked against what this
 * actor may change on this record; one disallowed field rejects the whole request.
 */
export async function updateWorkOrder(ctx: ActorContext, id: string, input: UpdateWorkOrderInput) {
  return db.$transaction(async (tx) => {
    const { facts } = await loadVisibleWorkOrder(tx, ctx.actor, id);
    const permissions = editPermissions(ctx.actor, facts);

    const requestedFields = EDITABLE_DETAIL_FIELDS.filter((field) => input[field] !== undefined);
    const blocked = requestedFields.filter((field) => !permissions.fields.includes(field));
    if (blocked.length > 0 || (input.factors && !permissions.factors) || (input.assigneeId !== undefined && !permissions.assign)) {
      throw new DomainError("FORBIDDEN", "You can’t change some of these fields on this work order.");
    }

    const current = await tx.workOrder.findUniqueOrThrow({
      where: { id },
      select: {
        title: true,
        summary: true,
        categoryId: true,
        locationLabel: true,
        assetLabel: true,
        safetyFlag: true,
        essentialServiceDown: true,
        multiplePeopleAffected: true,
        worsening: true,
        priority: true,
        priorityConfirmedAt: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true } },
      },
    });

    const data: Prisma.WorkOrderUncheckedUpdateManyInput = {};
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    if (input.title !== undefined && input.title !== current.title) {
      data.title = input.title;
      changes.title = { from: current.title, to: input.title };
    }
    for (const field of NULLABLE_DETAIL_FIELDS) {
      const next = input[field];
      if (next === undefined || next === current[field]) continue;
      if (field === "categoryId" && next !== null) await assertCategoryInWorkspace(tx, ctx.actor.workspaceId, next);
      data[field] = next;
      changes[field] = { from: current[field], to: next };
    }

    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, { ...auditBase(ctx, id), action: "work_order.updated", details: { changes } });
    }

    if (input.factors) {
      const factors: PriorityFactorValues = input.factors;
      const factorsChanged = PRIORITY_FACTORS.some((factor) => factors[factor.field] !== current[factor.field]);
      // Saving identical factors is a no-op, except a manager confirming a not-yet-confirmed priority.
      const confirming = permissions.confirmsPriority && (factorsChanged || !current.priorityConfirmedAt);
      if (factorsChanged || confirming) {
        const assessment = assessPriority(factors);
        Object.assign(data, factors, {
          impactScore: assessment.score,
          priority: assessment.priority,
          priorityRationale: assessment.rationale,
          // A non-manager change is a proposal, so any earlier confirmation no longer applies.
          priorityConfirmedAt: permissions.confirmsPriority ? new Date() : null,
        });
        await recordAudit(tx, {
          ...auditBase(ctx, id),
          action: permissions.confirmsPriority ? "work_order.priority_confirmed" : "work_order.updated",
          details: { factors, priority: { from: current.priority, to: assessment.priority }, score: assessment.score },
        });
      }
    }

    if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
      const assignee = input.assigneeId ? await loadAssignableTechnician(tx, ctx.actor.workspaceId, input.assigneeId) : null;
      data.assigneeId = assignee?.id ?? null;
      await recordAudit(tx, {
        ...auditBase(ctx, id),
        action: "work_order.assigned",
        details: { from: current.assignee, to: assignee },
      });
      if (!assignee && OWNED_STATUSES.includes(facts.status)) {
        data.status = WorkOrderStatus.TRIAGE;
        await recordReturnToTriage(tx, ctx, id, facts.status);
      }
    }

    if (Object.keys(data).length === 0) return { id, changed: false };
    // Conditional on the status the permissions were checked against, so a concurrent close or archive wins.
    const updated = await tx.workOrder.updateMany({ where: { id, status: facts.status }, data });
    if (updated.count === 0) throw new DomainError("CONFLICT", CHANGED_MEANWHILE);
    return { id, changed: true };
  });
}

/** Statuses that only make sense with an owner; losing the owner sends the work back to triage. */
export const OWNED_STATUSES: readonly WorkOrderStatus[] = [WorkOrderStatus.READY, WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.BLOCKED];

const CHANGED_MEANWHILE = "This work order changed while you were viewing it. Reload and try again.";

export async function recordReturnToTriage(tx: Tx, ctx: ActorContext, workOrderId: string, from: WorkOrderStatus) {
  const reason = "Owner removed; back to triage for a new owner.";
  await tx.statusEvent.create({ data: { workOrderId, actorId: ctx.actor.id, fromStatus: from, toStatus: WorkOrderStatus.TRIAGE, reason } });
  await recordAudit(tx, {
    ...auditBase(ctx, workOrderId),
    action: "work_order.status_changed",
    details: { from, to: WorkOrderStatus.TRIAGE, reason },
  });
}

export async function transitionWorkOrder(ctx: ActorContext, id: string, input: TransitionInput) {
  return db.$transaction(async (tx) => {
    const { facts } = await loadVisibleWorkOrder(tx, ctx.actor, id);
    const check = canTransitionStatus(ctx.actor, facts, {
      to: input.toStatus,
      reason: input.reason,
      resolutionNote: input.resolutionNote,
    });
    if (!check.ok) {
      throw new DomainError(check.code, check.message, check.field ? { [check.field]: [check.message] } : undefined);
    }

    const now = new Date();
    const data: Prisma.WorkOrderUpdateManyMutationInput = { status: input.toStatus };
    if (input.toStatus === WorkOrderStatus.RESOLVED) Object.assign(data, { resolutionNote: input.resolutionNote, resolvedAt: now });
    if (facts.status === WorkOrderStatus.RESOLVED && input.toStatus === WorkOrderStatus.IN_PROGRESS) {
      Object.assign(data, { resolutionNote: null, resolvedAt: null });
    }
    if (input.toStatus === WorkOrderStatus.CLOSED) data.closedAt = now;
    if (input.toStatus === WorkOrderStatus.ARCHIVED) data.archivedAt = now;

    // Conditional on the status we checked, so two racing transitions can't both apply.
    const updated = await tx.workOrder.updateMany({ where: { id, status: facts.status }, data });
    if (updated.count === 0) throw new DomainError("CONFLICT", CHANGED_MEANWHILE);

    await tx.statusEvent.create({
      data: {
        workOrderId: id,
        actorId: ctx.actor.id,
        fromStatus: facts.status,
        toStatus: input.toStatus,
        reason: input.reason || null,
      },
    });
    if (input.toStatus === WorkOrderStatus.RESOLVED && input.resolutionNote) {
      await tx.workOrderNote.create({
        data: { workOrderId: id, authorId: ctx.actor.id, kind: NoteKind.RESOLUTION, body: input.resolutionNote },
      });
    }
    await recordAudit(tx, {
      ...auditBase(ctx, id),
      action: "work_order.status_changed",
      details: { from: facts.status, to: input.toStatus, ...(input.reason ? { reason: input.reason } : {}) },
    });
    return { id, status: input.toStatus };
  });
}

export async function addWorkOrderNote(ctx: ActorContext, id: string, input: NoteInput) {
  return db.$transaction(async (tx) => {
    const { facts } = await loadVisibleWorkOrder(tx, ctx.actor, id);
    if (!allowedNoteKinds(ctx.actor, facts).includes(input.kind)) {
      throw new DomainError("FORBIDDEN", "You can’t add this kind of note to this work order.");
    }
    const touched = await tx.workOrder.updateMany({ where: { id, status: facts.status }, data: { updatedAt: new Date() } });
    if (touched.count === 0) throw new DomainError("CONFLICT", CHANGED_MEANWHILE);
    const note = await tx.workOrderNote.create({
      data: { workOrderId: id, authorId: ctx.actor.id, kind: input.kind, body: input.body },
      select: { id: true, kind: true, createdAt: true },
    });
    await recordAudit(tx, {
      ...auditBase(ctx, id),
      action: "work_order.note_added",
      details: { noteId: note.id, kind: note.kind, length: input.body.length },
    });
    return note;
  });
}
