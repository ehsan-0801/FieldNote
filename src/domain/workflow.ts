import { Role, WorkOrderStatus } from "@/generated/prisma/enums";

type Requirement = "resolutionNote" | "reason" | "assignee";

interface TransitionRule {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  roles: readonly Role[];
  requires: readonly Requirement[];
  label: string;
}

const MANAGERS = [Role.ADMIN, Role.COORDINATOR] as const;
const WORKERS = [Role.ADMIN, Role.COORDINATOR, Role.TECHNICIAN] as const;
const { SUBMITTED, TRIAGE, READY, IN_PROGRESS, BLOCKED, RESOLVED, CLOSED, ARCHIVED } = WorkOrderStatus;

/**
 * The complete list of legal transitions. Anything not listed is rejected with
 * INVALID_TRANSITION. Object-level checks (is this the reporter / assignee?) live
 * in access.ts; this table only answers "may this role make this move".
 * SUBMITTED → TRIAGE is how a reporter confirms their reviewed report.
 */
const TRANSITIONS: readonly TransitionRule[] = [
  { from: SUBMITTED, to: TRIAGE, roles: [...MANAGERS, Role.TECHNICIAN, Role.REPORTER], requires: [], label: "Send to triage" },
  { from: TRIAGE, to: READY, roles: MANAGERS, requires: ["assignee"], label: "Mark ready" },
  { from: TRIAGE, to: IN_PROGRESS, roles: MANAGERS, requires: ["assignee"], label: "Start work now" },
  { from: READY, to: IN_PROGRESS, roles: WORKERS, requires: ["assignee"], label: "Start work" },
  { from: IN_PROGRESS, to: BLOCKED, roles: WORKERS, requires: ["reason"], label: "Mark blocked" },
  { from: BLOCKED, to: IN_PROGRESS, roles: WORKERS, requires: [], label: "Resume work" },
  { from: IN_PROGRESS, to: RESOLVED, roles: WORKERS, requires: ["resolutionNote"], label: "Resolve" },
  { from: RESOLVED, to: IN_PROGRESS, roles: MANAGERS, requires: ["reason"], label: "Reopen" },
  { from: RESOLVED, to: CLOSED, roles: MANAGERS, requires: [], label: "Close" },
  ...[SUBMITTED, TRIAGE, READY, BLOCKED, RESOLVED, CLOSED].map((from): TransitionRule => ({
    from,
    to: ARCHIVED,
    roles: MANAGERS,
    requires: ["reason"],
    label: "Archive",
  })),
];

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  SUBMITTED: "Submitted",
  TRIAGE: "Triage",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

export const OPEN_STATUSES: readonly WorkOrderStatus[] = [SUBMITTED, TRIAGE, READY, IN_PROGRESS, BLOCKED];
export const FROZEN_STATUSES: readonly WorkOrderStatus[] = [CLOSED, ARCHIVED];

export function findTransition(from: WorkOrderStatus, to: WorkOrderStatus): TransitionRule | undefined {
  return TRANSITIONS.find((rule) => rule.from === from && rule.to === to);
}

export function transitionsFrom(from: WorkOrderStatus, role: Role): TransitionRule[] {
  return TRANSITIONS.filter((rule) => rule.from === from && rule.roles.includes(role));
}

export interface TransitionAttempt {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  role: Role;
  hasAssignee: boolean;
  reason?: string | null;
  resolutionNote?: string | null;
}

export type TransitionCheck =
  | { ok: true; rule: TransitionRule }
  | { ok: false; code: "INVALID_TRANSITION" | "FORBIDDEN" | "VALIDATION_ERROR"; message: string; field?: string };

export function checkTransition(attempt: TransitionAttempt): TransitionCheck {
  const rule = findTransition(attempt.from, attempt.to);
  if (!rule) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `A work order can’t move from ${STATUS_LABEL[attempt.from]} to ${STATUS_LABEL[attempt.to]}.`,
    };
  }
  if (!rule.roles.includes(attempt.role)) {
    return { ok: false, code: "FORBIDDEN", message: "Your role can’t make this status change." };
  }
  if (rule.requires.includes("assignee") && !attempt.hasAssignee) {
    return { ok: false, code: "INVALID_TRANSITION", message: "Assign an owner before this work can start." };
  }
  if (rule.requires.includes("resolutionNote") && !attempt.resolutionNote?.trim()) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Add a resolution note before closing this work.",
      field: "resolutionNote",
    };
  }
  if (rule.requires.includes("reason") && !attempt.reason?.trim()) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Give a short reason for this change.", field: "reason" };
  }
  return { ok: true, rule };
}

export function transitionRequirements(from: WorkOrderStatus, to: WorkOrderStatus): readonly Requirement[] {
  return findTransition(from, to)?.requires ?? [];
}
