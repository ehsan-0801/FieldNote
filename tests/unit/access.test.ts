import { describe, expect, it } from "vitest";
import { NoteKind, Role, WorkOrderStatus } from "@/generated/prisma/enums";
import {
  allowedNoteKinds,
  auditScope,
  canAssignWorkOrder,
  canManageWorkspace,
  canTransitionStatus,
  canViewWorkOrder,
  editPermissions,
  relationTo,
  visibilityScope,
  type Actor,
  type WorkOrderAccessFacts,
} from "@/domain/access";

const WS = "ws_northgate";
const admin: Actor = { id: "u_admin", workspaceId: WS, role: Role.ADMIN };
const coordinator: Actor = { id: "u_coord", workspaceId: WS, role: Role.COORDINATOR };
const assignedTech: Actor = { id: "u_tech1", workspaceId: WS, role: Role.TECHNICIAN };
const otherTech: Actor = { id: "u_tech2", workspaceId: WS, role: Role.TECHNICIAN };
const reporter: Actor = { id: "u_rep1", workspaceId: WS, role: Role.REPORTER };
const otherReporter: Actor = { id: "u_rep2", workspaceId: WS, role: Role.REPORTER };
const foreignAdmin: Actor = { id: "u_admin_b", workspaceId: "ws_harbor", role: Role.ADMIN };

const workOrder = (overrides: Partial<WorkOrderAccessFacts> = {}): WorkOrderAccessFacts => ({
  workspaceId: WS,
  reporterId: reporter.id,
  assigneeId: assignedTech.id,
  status: WorkOrderStatus.IN_PROGRESS,
  ...overrides,
});

describe("viewing", () => {
  it.each([
    ["admin", admin, true],
    ["coordinator", coordinator, true],
    ["assigned technician", assignedTech, true],
    ["unassigned technician", otherTech, false],
    ["reporting user", reporter, true],
    ["another reporter", otherReporter, false],
    ["admin of another workspace", foreignAdmin, false],
  ])("%s → %s", (_label, actor, expected) => {
    expect(canViewWorkOrder(actor, workOrder())).toBe(expected);
  });

  it("treats a technician who filed a report as its reporter, not its assignee", () => {
    const filedByTech = workOrder({ reporterId: otherTech.id, assigneeId: null, status: WorkOrderStatus.SUBMITTED });
    expect(relationTo(otherTech, filedByTech)).toBe("reporter");
  });

  it("maps roles to list scopes", () => {
    expect(visibilityScope(Role.ADMIN)).toBe("workspace");
    expect(visibilityScope(Role.COORDINATOR)).toBe("workspace");
    expect(visibilityScope(Role.TECHNICIAN)).toBe("assignedOrReported");
    expect(visibilityScope(Role.REPORTER)).toBe("reported");
  });
});

describe("editing", () => {
  it("lets coordinators edit triage fields, factors and assignment", () => {
    expect(editPermissions(coordinator, workOrder())).toMatchObject({ factors: true, confirmsPriority: true, assign: true });
  });

  it("limits assigned technicians to on-site facts", () => {
    const permissions = editPermissions(assignedTech, workOrder());
    expect(permissions.fields).toEqual(["summary", "locationLabel", "assetLabel"]);
    expect(permissions.assign).toBe(false);
    expect(permissions.factors).toBe(false);
    expect(canAssignWorkOrder(assignedTech, workOrder())).toBe(false);
  });

  it("lets reporters edit their own draft only before triage", () => {
    expect(editPermissions(reporter, workOrder({ status: WorkOrderStatus.SUBMITTED })).fields).toContain("title");
    expect(editPermissions(reporter, workOrder({ status: WorkOrderStatus.SUBMITTED })).confirmsPriority).toBe(false);
    expect(editPermissions(reporter, workOrder({ status: WorkOrderStatus.TRIAGE })).fields).toHaveLength(0);
    expect(editPermissions(otherReporter, workOrder({ status: WorkOrderStatus.SUBMITTED })).fields).toHaveLength(0);
  });

  it("freezes closed and archived work for everyone", () => {
    for (const status of [WorkOrderStatus.CLOSED, WorkOrderStatus.ARCHIVED]) {
      expect(editPermissions(admin, workOrder({ status })).fields).toHaveLength(0);
    }
  });
});

describe("status changes with ownership", () => {
  it("lets the assigned technician resolve with a note", () => {
    expect(canTransitionStatus(assignedTech, workOrder(), { to: WorkOrderStatus.RESOLVED, resolutionNote: "Fixed" }).ok).toBe(true);
  });

  it("blocks a technician who is not assigned", () => {
    expect(canTransitionStatus(otherTech, workOrder(), { to: WorkOrderStatus.RESOLVED, resolutionNote: "Fixed" })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("allows the reporter only to submit their own report to triage", () => {
    const draft = workOrder({ status: WorkOrderStatus.SUBMITTED, assigneeId: null });
    expect(canTransitionStatus(reporter, draft, { to: WorkOrderStatus.TRIAGE }).ok).toBe(true);
    expect(canTransitionStatus(otherReporter, draft, { to: WorkOrderStatus.TRIAGE }).ok).toBe(false);
    expect(canTransitionStatus(reporter, draft, { to: WorkOrderStatus.ARCHIVED, reason: "nvm" }).ok).toBe(false);
  });

  it("denies everything across workspaces", () => {
    expect(canTransitionStatus(foreignAdmin, workOrder(), { to: WorkOrderStatus.BLOCKED, reason: "x" }).ok).toBe(false);
  });
});

describe("notes and administration", () => {
  it("gives reporters comments only and workers progress notes", () => {
    expect(allowedNoteKinds(reporter, workOrder())).toEqual([NoteKind.COMMENT]);
    expect(allowedNoteKinds(assignedTech, workOrder())).toEqual([NoteKind.COMMENT, NoteKind.PROGRESS]);
    expect(allowedNoteKinds(otherTech, workOrder())).toEqual([]);
    expect(allowedNoteKinds(admin, workOrder({ status: WorkOrderStatus.ARCHIVED }))).toEqual([]);
  });

  it("restricts workspace management to admins", () => {
    expect(canManageWorkspace(admin)).toBe(true);
    for (const actor of [coordinator, assignedTech, reporter]) expect(canManageWorkspace(actor)).toBe(false);
  });

  it("gives coordinators work-order history but not account administration", () => {
    expect(auditScope(Role.ADMIN)).toBe("workspace");
    expect(auditScope(Role.COORDINATOR)).toBe("workOrders");
    expect(auditScope(Role.TECHNICIAN)).toBe("visibleWorkOrders");
    expect(auditScope(Role.REPORTER)).toBe("visibleWorkOrders");
  });
});
