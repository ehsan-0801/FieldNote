import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { auditScope, canManageWorkspace, type Actor } from "@/domain/access";
import { WORK_ORDER_HISTORY_ENTITIES } from "@/domain/audit-actions";
import { DomainError } from "@/domain/errors";
import type { AuditQuery } from "@/domain/schemas";
import { db } from "./db";
import { visibleWorkOrdersWhere } from "./work-orders/scope";

const AUDIT_PAGE_SIZE = 40;
// Upper bound on how many work orders feed a personal activity stream.
const VISIBLE_ID_LIMIT = 2000;

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  createdAt: true,
  requestId: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.AuditEventSelect;

async function scopeWhere(actor: Actor): Promise<Prisma.AuditEventWhereInput> {
  const scope = auditScope(actor.role);
  const base: Prisma.AuditEventWhereInput = { workspaceId: actor.workspaceId };
  if (scope === "workspace") return base;
  if (scope === "workOrders") return { ...base, entityType: { in: [...WORK_ORDER_HISTORY_ENTITIES] } };
  const visible = await db.workOrder.findMany({
    where: visibleWorkOrdersWhere(actor),
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: VISIBLE_ID_LIMIT,
  });
  return { ...base, entityType: "WorkOrder", entityId: { in: visible.map((row) => row.id) } };
}

/** Activity stream for /app/activity and the overview, limited to what the actor may see. */
export async function listActivity(actor: Actor, page = 1, pageSize = AUDIT_PAGE_SIZE) {
  const where = await scopeWhere(actor);
  const [total, events] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      select: auditSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    events,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    references: await referencesFor(actor, events),
  };
}

/** Full audit log with filters; administrators only. */
export async function listAuditLog(actor: Actor, query: AuditQuery) {
  if (!canManageWorkspace(actor)) throw new DomainError("FORBIDDEN", "Only administrators can open the audit log.");
  const where: Prisma.AuditEventWhereInput = {
    workspaceId: actor.workspaceId,
    ...(query.action ? { action: query.action } : {}),
    ...(query.actor ? { actorId: query.actor } : {}),
    ...(query.entity ? { entityType: query.entity } : {}),
  };
  const [total, events] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      select: auditSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
  ]);
  return {
    events,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    references: await referencesFor(actor, events),
  };
}

/** People to filter the audit log by; administrators only. */
export async function listAuditActors(actor: Actor) {
  if (!canManageWorkspace(actor)) throw new DomainError("FORBIDDEN", "Only administrators can open the audit log.");
  return db.user.findMany({
    where: { workspaceId: actor.workspaceId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

async function referencesFor(actor: Actor, events: { entityType: string; entityId: string }[]) {
  const ids = [...new Set(events.filter((event) => event.entityType === "WorkOrder").map((event) => event.entityId))];
  if (ids.length === 0) return {};
  const rows = await db.workOrder.findMany({
    where: { id: { in: ids }, workspaceId: actor.workspaceId },
    select: { id: true, reference: true, title: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, { reference: row.reference, title: row.title }]));
}
