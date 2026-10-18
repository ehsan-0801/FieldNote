import { describe, expect, it } from "vitest";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { checkTransition, findTransition } from "@/domain/workflow";

const { SUBMITTED, TRIAGE, READY, IN_PROGRESS, BLOCKED, RESOLVED, CLOSED, ARCHIVED } = WorkOrderStatus;
const ALL = Object.values(WorkOrderStatus);

const LEGAL: [WorkOrderStatus, WorkOrderStatus][] = [
  [SUBMITTED, TRIAGE],
  [TRIAGE, READY],
  [TRIAGE, IN_PROGRESS],
  [READY, IN_PROGRESS],
  [IN_PROGRESS, BLOCKED],
  [BLOCKED, IN_PROGRESS],
  [IN_PROGRESS, RESOLVED],
  [RESOLVED, IN_PROGRESS],
  [RESOLVED, CLOSED],
  [SUBMITTED, ARCHIVED],
  [TRIAGE, ARCHIVED],
  [READY, ARCHIVED],
  [BLOCKED, ARCHIVED],
  [RESOLVED, ARCHIVED],
  [CLOSED, ARCHIVED],
];

const isLegal = (from: WorkOrderStatus, to: WorkOrderStatus) => LEGAL.some(([a, b]) => a === from && b === to);

describe("transition table", () => {
  it("contains exactly the documented transitions", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        expect(Boolean(findTransition(from, to)), `${from} → ${to}`).toBe(isLegal(from, to));
      }
    }
  });

  it("rejects undocumented moves with INVALID_TRANSITION, even for admins", () => {
    for (const [from, to] of [
      [SUBMITTED, RESOLVED],
      [READY, RESOLVED],
      [CLOSED, IN_PROGRESS],
      [ARCHIVED, TRIAGE],
      [IN_PROGRESS, ARCHIVED],
      [BLOCKED, RESOLVED],
    ] as const) {
      const result = checkTransition({ from, to, role: Role.ADMIN, hasAssignee: true, reason: "x", resolutionNote: "done" });
      expect(result).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    }
  });
});

describe("role rules", () => {
  it("only coordinators and admins may skip straight from triage to in progress", () => {
    expect(checkTransition({ from: TRIAGE, to: IN_PROGRESS, role: Role.COORDINATOR, hasAssignee: true }).ok).toBe(true);
    expect(checkTransition({ from: TRIAGE, to: IN_PROGRESS, role: Role.TECHNICIAN, hasAssignee: true })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
  });

  it("only coordinators and admins may reopen resolved work, and need a reason", () => {
    expect(
      checkTransition({ from: RESOLVED, to: IN_PROGRESS, role: Role.TECHNICIAN, hasAssignee: true, reason: "missed a spot" }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(checkTransition({ from: RESOLVED, to: IN_PROGRESS, role: Role.COORDINATOR, hasAssignee: true })).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      field: "reason",
    });
    expect(
      checkTransition({ from: RESOLVED, to: IN_PROGRESS, role: Role.COORDINATOR, hasAssignee: true, reason: "Still dripping" }).ok,
    ).toBe(true);
  });

  it("reporters cannot move work beyond submission", () => {
    expect(checkTransition({ from: SUBMITTED, to: TRIAGE, role: Role.REPORTER, hasAssignee: false }).ok).toBe(true);
    expect(checkTransition({ from: TRIAGE, to: READY, role: Role.REPORTER, hasAssignee: true })).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
    });
    expect(
      checkTransition({ from: IN_PROGRESS, to: RESOLVED, role: Role.REPORTER, hasAssignee: true, resolutionNote: "fixed" }),
    ).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("requirements", () => {
  it("requires a resolution note to resolve", () => {
    expect(checkTransition({ from: IN_PROGRESS, to: RESOLVED, role: Role.TECHNICIAN, hasAssignee: true })).toMatchObject({
      ok: false,
      code: "VALIDATION_ERROR",
      field: "resolutionNote",
    });
    expect(checkTransition({ from: IN_PROGRESS, to: RESOLVED, role: Role.TECHNICIAN, hasAssignee: true, resolutionNote: "   " }).ok).toBe(
      false,
    );
    expect(
      checkTransition({
        from: IN_PROGRESS,
        to: RESOLVED,
        role: Role.TECHNICIAN,
        hasAssignee: true,
        resolutionNote: "Replaced the ballast.",
      }).ok,
    ).toBe(true);
  });

  it("requires an owner before work becomes ready or starts", () => {
    expect(checkTransition({ from: TRIAGE, to: READY, role: Role.COORDINATOR, hasAssignee: false })).toMatchObject({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(checkTransition({ from: TRIAGE, to: READY, role: Role.COORDINATOR, hasAssignee: true }).ok).toBe(true);
  });

  it("requires a reason to block or archive", () => {
    expect(checkTransition({ from: IN_PROGRESS, to: BLOCKED, role: Role.TECHNICIAN, hasAssignee: true }).ok).toBe(false);
    expect(checkTransition({ from: TRIAGE, to: ARCHIVED, role: Role.COORDINATOR, hasAssignee: false }).ok).toBe(false);
    expect(checkTransition({ from: TRIAGE, to: ARCHIVED, role: Role.COORDINATOR, hasAssignee: false, reason: "Duplicate" }).ok).toBe(true);
  });
});
