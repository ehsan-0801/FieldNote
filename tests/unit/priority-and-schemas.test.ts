import { describe, expect, it } from "vitest";
import { Priority } from "@/generated/prisma/enums";
import { NO_FACTORS, assessPriority, priorityForScore } from "@/domain/priority";
import {
  REPORT_MAX_LENGTH,
  createUserSchema,
  createWorkOrderSchema,
  noteSchema,
  transitionSchema,
  updateUserSchema,
  updateWorkOrderSchema,
  workOrderListQuerySchema,
} from "@/domain/schemas";

describe("priority score", () => {
  it("maps scores to bands", () => {
    expect(priorityForScore(0)).toBe(Priority.LOW);
    expect(priorityForScore(2)).toBe(Priority.NORMAL);
    expect(priorityForScore(3)).toBe(Priority.NORMAL);
    expect(priorityForScore(4)).toBe(Priority.HIGH);
    expect(priorityForScore(5)).toBe(Priority.HIGH);
    expect(priorityForScore(7)).toBe(Priority.URGENT);
  });

  it("scores the flickering, burning-smell light as urgent and explains why", () => {
    const result = assessPriority({ ...NO_FACTORS, safetyFlag: true, worsening: true });
    expect(result.score).toBe(7);
    expect(result.priority).toBe(Priority.URGENT);
    expect(result.rationale).toMatch(/^Urgent: possible safety risk reported and the issue is getting worse\./);
    expect(result.rationale).toMatch(/not a professional safety assessment/);
  });

  it("treats no confirmed factors as low impact", () => {
    expect(assessPriority(NO_FACTORS)).toMatchObject({ score: 0, priority: Priority.LOW });
  });
});

describe("input validation", () => {
  it("rejects oversized and empty reports", () => {
    expect(createWorkOrderSchema.safeParse({ originalReport: "x".repeat(REPORT_MAX_LENGTH + 1) }).success).toBe(false);
    expect(createWorkOrderSchema.safeParse({ originalReport: "   " }).success).toBe(false);
  });

  it("rejects authority-bearing fields instead of ignoring them", () => {
    const crafted = createWorkOrderSchema.safeParse({
      originalReport: "The hallway light keeps flickering.",
      reporterId: "someone-else",
      workspaceId: "other-workspace",
    });
    expect(crafted.success).toBe(false);
    expect(updateWorkOrderSchema.safeParse({ title: "Valid title", status: "CLOSED" }).success).toBe(false);
    expect(updateWorkOrderSchema.safeParse({ title: "Valid title", reporterId: "x" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: "ADMIN", workspaceId: "x" }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "Note", authorId: "x" }).success).toBe(false);
  });

  it("rejects empty titles, invalid enums and resolution notes as note kinds", () => {
    expect(updateWorkOrderSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(updateWorkOrderSchema.safeParse({}).success).toBe(false);
    expect(transitionSchema.safeParse({ toStatus: "DONE" }).success).toBe(false);
    expect(noteSchema.safeParse({ body: "Done", kind: "RESOLUTION" }).success).toBe(false);
    expect(
      createUserSchema.safeParse({ name: "Ana", email: "ana@example.test", role: "OWNER", password: "long-enough-pass" }).success,
    ).toBe(false);
  });

  it("requires strong passwords for new accounts", () => {
    expect(createUserSchema.safeParse({ name: "Ana", email: "ana@example.test", role: "REPORTER", password: "short" }).success).toBe(false);
  });

  it("normalises email addresses", () => {
    const parsed = createUserSchema.parse({ name: "Ana", email: "  Ana@Example.TEST ", role: "REPORTER", password: "long-enough-pass" });
    expect(parsed.email).toBe("ana@example.test");
  });

  it("allow-lists sort fields and page sizes", () => {
    expect(workOrderListQuerySchema.safeParse({ sort: "reporter.passwordHash" }).success).toBe(false);
    expect(workOrderListQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
    expect(workOrderListQuerySchema.parse({ sort: "", page: "" })).toMatchObject({ sort: "updated", page: 1, pageSize: 25 });
  });
});
