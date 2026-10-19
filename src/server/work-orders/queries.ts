import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { Priority, Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { allowedNoteKinds, editPermissions, type Actor } from "@/domain/access";
import {
  storedMissingDetailsSchema,
  storedSignalsSchema,
  storedSuggestedFieldsSchema,
  type AiErrorCode,
  AI_ERROR_CODES,
} from "@/domain/extraction";
import type { WorkOrderListQuery } from "@/domain/schemas";
import { OPEN_STATUSES, transitionsFrom } from "@/domain/workflow";
import { db } from "../db";
import { loadVisibleWorkOrder, visibleWorkOrdersWhere } from "./scope";

const listSelect = {
  id: true,
  reference: true,
  title: true,
  locationLabel: true,
  priority: true,
  priorityConfirmedAt: true,
  safetyFlag: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true } },
  category: { select: { name: true } },
} satisfies Prisma.WorkOrderSelect;

// Upper bounds for lists that are not paginated; workspaces this size are far beyond the target users.
export const MAX_OPTIONS = 200;
const MAX_NOTES = 200;
const TIMELINE_LIMIT = 200;

export type WorkOrderListItem = Prisma.WorkOrderGetPayload<{ select: typeof listSelect }>;

function listOrder(query: WorkOrderListQuery): Prisma.WorkOrderOrderByWithRelationInput[] {
  const dir = query.dir;
  switch (query.sort) {
    case "created":
      return [{ createdAt: dir }, { id: dir }];
    // Postgres orders enums by declaration (LOW → URGENT), so desc puts urgent first.
    case "priority":
      return [{ priority: dir }, { updatedAt: "desc" }, { id: "desc" }];
    case "updated":
      return [{ updatedAt: dir }, { id: dir }];
  }
}

export async function listWorkOrders(actor: Actor, query: WorkOrderListQuery) {
  const filters: Prisma.WorkOrderWhereInput[] = [visibleWorkOrdersWhere(actor)];
  // Archived work is hidden unless asked for explicitly.
  filters.push(query.status ? { status: query.status } : { status: { not: WorkOrderStatus.ARCHIVED } });
  if (query.priority) filters.push({ priority: query.priority });
  if (query.category) filters.push({ categoryId: query.category });
  if (query.owner === "me") filters.push({ assigneeId: actor.id });
  else if (query.owner === "unassigned") filters.push({ assigneeId: null });
  else if (query.owner) filters.push({ assigneeId: query.owner });
  if (query.q) {
    // LIKE treats % and _ as wildcards; escape them so the search matches what was typed.
    const contains = { contains: query.q.replace(/[\\%_]/g, (char) => `\\${char}`), mode: "insensitive" as const };
    filters.push({ OR: [{ title: contains }, { reference: contains }, { locationLabel: contains }, { originalReport: contains }] });
  }

  const where: Prisma.WorkOrderWhereInput = { AND: filters };
  const [total, items] = await Promise.all([
    db.workOrder.count({ where }),
    db.workOrder.findMany({
      where,
      select: listSelect,
      orderBy: listOrder(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}

/** Categories offered when filing or editing a report. */
export function listActiveCategories(actor: Actor) {
  return db.category.findMany({
    where: { workspaceId: actor.workspaceId, isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: MAX_OPTIONS,
  });
}

/** Options for list filters. Owner choices are only offered to people who can see everyone's work. */
export async function listFilterOptions(actor: Actor) {
  const managesWork = actor.role === Role.ADMIN || actor.role === Role.COORDINATOR;
  const [categories, owners] = await Promise.all([
    db.category.findMany({
      where: { workspaceId: actor.workspaceId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: MAX_OPTIONS,
    }),
    managesWork
      ? db.user.findMany({
          where: { workspaceId: actor.workspaceId, role: Role.TECHNICIAN },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: MAX_OPTIONS,
        })
      : Promise.resolve(null),
  ]);
  return { categories, owners };
}

function isAiErrorCode(value: string | null): value is AiErrorCode {
  return value !== null && AI_ERROR_CODES.some((code) => code === value);
}

export async function getWorkOrderDetail(actor: Actor, id: string) {
  const { facts, relation } = await loadVisibleWorkOrder(db, actor, id);
  const permissions = editPermissions(actor, facts);

  const [workOrder, timeline, latestExtraction] = await Promise.all([
    db.workOrder.findUniqueOrThrow({
      where: { id },
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, slug: true } },
        notes: {
          // Newest notes win on very long records; put back in reading order below.
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: MAX_NOTES,
          select: { id: true, kind: true, body: true, createdAt: true, author: { select: { name: true, role: true } } },
        },
      },
    }),
    db.auditEvent.findMany({
      where: { workspaceId: actor.workspaceId, entityType: "WorkOrder", entityId: id },
      // Newest first so busy records keep their latest history; reversed below for display.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TIMELINE_LIMIT,
      select: { id: true, action: true, details: true, createdAt: true, actor: { select: { name: true } } },
    }),
    db.aiExtraction.findFirst({ where: { workOrderId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  const needsOptions = permissions.assign || permissions.fields.includes("categoryId");
  const [technicians, categories] = needsOptions
    ? await Promise.all([
        permissions.assign
          ? db.user.findMany({
              where: { workspaceId: actor.workspaceId, role: Role.TECHNICIAN, isActive: true },
              select: { id: true, name: true },
              orderBy: { name: "asc" },
              take: MAX_OPTIONS,
            })
          : Promise.resolve([]),
        listActiveCategories(actor),
      ])
    : [[], []];

  return {
    workOrder: { ...workOrder, notes: workOrder.notes.reverse() },
    relation,
    permissions,
    transitions: transitionsFrom(facts.status, relation === "reporter" ? Role.REPORTER : actor.role)
      .filter((rule) => relation !== "reporter" || rule.to === WorkOrderStatus.TRIAGE)
      .map((rule) => ({ to: rule.to, label: rule.label, requires: rule.requires })),
    noteKinds: allowedNoteKinds(actor, facts),
    timeline: timeline.reverse(),
    extraction: latestExtraction ? parseStoredExtraction(latestExtraction) : null,
    technicians,
    categories,
  };
}

export type WorkOrderDetail = Awaited<ReturnType<typeof getWorkOrderDetail>>;

/** Stored AI JSON is re-validated before rendering; a row that fails is treated as absent. */
export function parseStoredExtraction(row: {
  id: string;
  provider: string;
  model: string;
  status: "SUCCEEDED" | "FALLBACK";
  suggestedTitle: string | null;
  summary: string | null;
  suggestedFields: Prisma.JsonValue;
  evidenceSignals: Prisma.JsonValue;
  missingDetails: Prisma.JsonValue;
  confidence: number | null;
  errorCode: string | null;
  createdAt: Date;
}) {
  const fields = storedSuggestedFieldsSchema.safeParse(row.suggestedFields);
  const signals = storedSignalsSchema.safeParse(row.evidenceSignals);
  const missing = storedMissingDetailsSchema.safeParse(row.missingDetails);
  if (!fields.success || !signals.success || !missing.success) return null;
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    status: row.status,
    errorCode: isAiErrorCode(row.errorCode) ? row.errorCode : null,
    createdAt: row.createdAt,
    suggestion: {
      suggestedTitle: row.suggestedTitle ?? "",
      summary: row.summary ?? "",
      categorySlug: fields.data.categorySlug,
      suggestedPriority: fields.data.suggestedPriority,
      suggestedNextStep: fields.data.suggestedNextStep,
      signals: signals.data,
      missingDetails: missing.data,
      confidence: row.confidence,
    },
  };
}

/** Monday 00:00 UTC of the current week; all dashboard dates are UTC like the timestamps shown. */
function startOfWeek(now: Date): Date {
  const start = new Date(now);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export const AT_RISK_AGE_DAYS = 3;

export async function getDashboardSummary(actor: Actor, now = new Date()) {
  const visible = visibleWorkOrdersWhere(actor);
  const open: Prisma.WorkOrderWhereInput = { AND: [visible, { status: { in: [...OPEN_STATUSES] } }] };
  const staleBefore = new Date(now.getTime() - AT_RISK_AGE_DAYS * 24 * 60 * 60 * 1000);
  // "At risk": urgent, blocked, or high priority and open longer than AT_RISK_AGE_DAYS.
  const atRisk: Prisma.WorkOrderWhereInput = {
    AND: [
      open,
      {
        OR: [
          { priority: Priority.URGENT },
          { status: WorkOrderStatus.BLOCKED },
          { priority: Priority.HIGH, createdAt: { lt: staleBefore } },
        ],
      },
    ],
  };
  const awaitingDecision: Prisma.WorkOrderWhereInput = {
    AND: [
      visible,
      {
        OR: [{ status: WorkOrderStatus.TRIAGE }, { status: { in: [WorkOrderStatus.READY, WorkOrderStatus.BLOCKED] }, assigneeId: null }],
      },
    ],
  };

  const [openCount, waitingCount, atRiskCount, resolvedThisWeek, openByPriority, decisions, myQueue] = await Promise.all([
    db.workOrder.count({ where: open }),
    db.workOrder.count({ where: { AND: [open, { assigneeId: null }] } }),
    db.workOrder.count({ where: atRisk }),
    db.workOrder.count({ where: { AND: [visible, { resolvedAt: { gte: startOfWeek(now) } }] } }),
    db.workOrder.groupBy({ by: ["priority"], where: open, _count: { _all: true } }),
    actor.role === Role.ADMIN || actor.role === Role.COORDINATOR
      ? db.workOrder.findMany({
          where: awaitingDecision,
          select: listSelect,
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          take: 6,
        })
      : Promise.resolve([]),
    // Only technicians are assignable, so only they have a personal queue.
    actor.role === Role.TECHNICIAN
      ? db.workOrder.findMany({
          where: { workspaceId: actor.workspaceId, assigneeId: actor.id, status: { in: [...OPEN_STATUSES] } },
          select: listSelect,
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  const byPriority: Record<Priority, number> = { URGENT: 0, HIGH: 0, NORMAL: 0, LOW: 0 };
  for (const row of openByPriority) byPriority[row.priority] = row._count._all;

  return {
    metrics: { open: openCount, waitingForAssignment: waitingCount, atRisk: atRiskCount, resolvedThisWeek },
    openByPriority: byPriority,
    decisions,
    myQueue,
  };
}
