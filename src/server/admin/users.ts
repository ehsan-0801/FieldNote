import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { canManageWorkspace, type Actor } from "@/domain/access";
import { OPEN_STATUSES } from "@/domain/workflow";
import { OWNED_STATUSES, recordReturnToTriage } from "../work-orders/commands";
import type { AuditEntityType } from "@/domain/audit-actions";
import { DomainError } from "@/domain/errors";
import type { createUserSchema, updateUserSchema } from "@/domain/schemas";
import { recordAudit } from "../audit";
import { hashPassword } from "../auth/password";
import { destroyUserSessions } from "../auth/session";
import { db } from "../db";
import type { ActorContext } from "../request-context";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  _count: { select: { assignedWorkOrders: true, reportedWorkOrders: true } },
} satisfies Prisma.UserSelect;

const MAX_PEOPLE = 500;

function assertAdmin(actor: Actor) {
  if (!canManageWorkspace(actor)) throw new DomainError("FORBIDDEN", "Only administrators can manage people.");
}

export async function listUsers(actor: Actor) {
  assertAdmin(actor);
  return db.user.findMany({
    where: { workspaceId: actor.workspaceId },
    select: userSelect,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take: MAX_PEOPLE,
  });
}

export async function createUser(ctx: ActorContext, input: z.infer<typeof createUserSchema>) {
  assertAdmin(ctx.actor);
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { workspaceId: ctx.actor.workspaceId, name: input.name, email: input.email, role: input.role, passwordHash },
        select: userSelect,
      });
      await recordAudit(tx, {
        workspaceId: ctx.actor.workspaceId,
        actorId: ctx.actor.id,
        action: "user.created",
        entityType: "User",
        entityId: user.id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        details: { name: user.name, role: user.role },
      });
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("CONFLICT", "An account with this email already exists.", { email: ["Already in use."] });
    }
    throw error;
  }
}

/**
 * Role and activation changes end the person's existing sessions, so new
 * permissions take effect on their next request rather than whenever they sign out.
 */
export async function updateUser(ctx: ActorContext, userId: string, input: z.infer<typeof updateUserSchema>) {
  assertAdmin(ctx.actor);
  if (userId === ctx.actor.id && (input.role !== undefined || input.isActive === false)) {
    throw new DomainError("FORBIDDEN", "You can’t change your own role or deactivate your own account.");
  }
  const { password, ...profile } = input;
  const passwordHash = password ? await hashPassword(password) : undefined;

  const result = await db.$transaction(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id: userId, workspaceId: ctx.actor.workspaceId },
      select: { id: true, name: true, role: true, isActive: true },
    });
    if (!current) throw new DomainError("NOT_FOUND", "That account isn’t in this workspace.");

    const entityType: AuditEntityType = "User";
    const audit = {
      workspaceId: ctx.actor.workspaceId,
      actorId: ctx.actor.id,
      entityType,
      entityId: userId,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
    };
    const roleChanged = input.role !== undefined && input.role !== current.role;
    const activeChanged = input.isActive !== undefined && input.isActive !== current.isActive;
    const nameChanged = input.name !== undefined && input.name !== current.name;

    // A workspace must always keep one active administrator.
    const losesAdmin =
      current.role === Role.ADMIN && current.isActive && ((roleChanged && input.role !== Role.ADMIN) || input.isActive === false);
    if (losesAdmin) {
      const otherAdmins = await tx.user.count({
        where: { workspaceId: ctx.actor.workspaceId, role: Role.ADMIN, isActive: true, id: { not: userId } },
      });
      if (otherAdmins === 0) throw new DomainError("CONFLICT", "The workspace needs at least one active administrator.");
    }

    if (roleChanged)
      await recordAudit(tx, { ...audit, action: "user.role_changed", details: { from: current.role, to: input.role ?? current.role } });
    if (activeChanged) await recordAudit(tx, { ...audit, action: input.isActive ? "user.reactivated" : "user.deactivated" });
    if (passwordHash) await recordAudit(tx, { ...audit, action: "user.password_reset" });
    if (nameChanged)
      await recordAudit(tx, {
        ...audit,
        action: "user.updated",
        details: { name: { from: current.name, to: input.name ?? current.name } },
      });

    const leavesTechnicianPool = input.isActive === false || (roleChanged && current.role === Role.TECHNICIAN);
    if (leavesTechnicianPool) {
      // Open work shouldn't sit with someone who can no longer work on it; each release is audited.
      const held = await tx.workOrder.findMany({
        where: { assigneeId: userId, workspaceId: ctx.actor.workspaceId, status: { in: [...OPEN_STATUSES] } },
        select: { id: true, status: true },
      });
      for (const workOrder of held) {
        const backToTriage = OWNED_STATUSES.includes(workOrder.status);
        await tx.workOrder.update({
          where: { id: workOrder.id },
          data: { assigneeId: null, ...(backToTriage ? { status: WorkOrderStatus.TRIAGE } : {}) },
        });
        await recordAudit(tx, {
          ...audit,
          entityType: "WorkOrder",
          entityId: workOrder.id,
          action: "work_order.assigned",
          details: { from: { id: current.id, name: current.name }, to: null, reason: "Owner’s account changed" },
        });
        if (backToTriage) await recordReturnToTriage(tx, ctx, workOrder.id, workOrder.status);
      }
    }
    const user = await tx.user.update({
      where: { id: userId },
      data: { ...profile, ...(passwordHash ? { passwordHash } : {}) },
      select: userSelect,
    });
    return { user, revokeSessions: roleChanged || activeChanged || Boolean(passwordHash) };
  });

  if (result.revokeSessions) await destroyUserSessions(userId);
  return result.user;
}
