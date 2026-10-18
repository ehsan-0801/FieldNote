import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { relationTo, visibilityScope, type Actor, type WorkOrderRelation } from "@/domain/access";
import { DomainError, NOT_FOUND_MESSAGE } from "@/domain/errors";
import type { Tx } from "../db";

/** Prisma filter for every work order the actor may see. Always includes the workspace. */
export function visibleWorkOrdersWhere(actor: Actor): Prisma.WorkOrderWhereInput {
  const scope = visibilityScope(actor.role);
  const base: Prisma.WorkOrderWhereInput = { workspaceId: actor.workspaceId };
  if (scope === "workspace") return base;
  if (scope === "assignedOrReported") {
    return { ...base, OR: [{ assigneeId: actor.id }, { reporterId: actor.id }] };
  }
  return { ...base, reporterId: actor.id };
}

const accessFactsSelect = {
  id: true,
  workspaceId: true,
  reporterId: true,
  assigneeId: true,
  status: true,
} satisfies Prisma.WorkOrderSelect;

export type WorkOrderFacts = Prisma.WorkOrderGetPayload<{ select: typeof accessFactsSelect }>;

const ID_PATTERN = /^[a-z0-9]{8,40}$/i;

/**
 * Loads a work order the actor can see, or throws NOT_FOUND. The same error is
 * used for "doesn't exist", "other workspace" and "not yours", so probing IDs
 * reveals nothing.
 */
export async function loadVisibleWorkOrder(
  tx: Tx,
  actor: Actor,
  id: string,
): Promise<{ facts: WorkOrderFacts; relation: WorkOrderRelation }> {
  if (!ID_PATTERN.test(id)) throw new DomainError("NOT_FOUND", NOT_FOUND_MESSAGE);
  const facts = await tx.workOrder.findFirst({
    where: { id, workspaceId: actor.workspaceId },
    select: accessFactsSelect,
  });
  const relation = facts ? relationTo(actor, facts) : null;
  if (!facts || !relation) throw new DomainError("NOT_FOUND", NOT_FOUND_MESSAGE);
  return { facts, relation };
}
