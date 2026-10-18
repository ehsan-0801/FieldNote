import { beforeEach, describe, expect, it } from "vitest";
import { NoteKind, Priority, WorkOrderStatus } from "@/generated/prisma/enums";
import { DomainError } from "@/domain/errors";
import { db } from "@/server/db";
import { addWorkOrderNote, createWorkOrder, transitionWorkOrder, updateWorkOrder } from "@/server/work-orders/commands";
import { ctxFor, seedFixture, workOrderFor, type Fixture } from "../support/fixtures";

let fixture: Fixture;
beforeEach(async () => {
  fixture = await seedFixture();
});

describe("full lifecycle", () => {
  it("runs reporter → coordinator → technician and records every step", async () => {
    const reporter = ctxFor(fixture.people.reporter);
    const coordinator = ctxFor(fixture.people.coordinator);
    const tech = ctxFor(fixture.people.tech);

    const created = await createWorkOrder(reporter, {
      originalReport: "The hallway light near room 204 keeps flickering and smells burnt.",
      locationLabel: "Level 2 hallway",
    });
    expect(created.reference).toBe("WO-1001");
    expect(created.status).toBe(WorkOrderStatus.SUBMITTED);

    await updateWorkOrder(reporter, created.id, {
      title: "Flickering hallway light with burning smell",
      categoryId: fixture.electrical.id,
      factors: { safetyFlag: true, essentialServiceDown: false, multiplePeopleAffected: false, worsening: true },
    });
    let row = await db.workOrder.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.priority).toBe(Priority.URGENT);
    expect(row.priorityConfirmedAt).toBeNull();

    await transitionWorkOrder(reporter, created.id, { toStatus: WorkOrderStatus.TRIAGE });
    await updateWorkOrder(coordinator, created.id, {
      assigneeId: fixture.people.tech.id,
      factors: { safetyFlag: true, essentialServiceDown: false, multiplePeopleAffected: false, worsening: true },
    });
    row = await db.workOrder.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.priorityConfirmedAt).not.toBeNull();

    await transitionWorkOrder(coordinator, created.id, { toStatus: WorkOrderStatus.READY });
    await transitionWorkOrder(tech, created.id, { toStatus: WorkOrderStatus.IN_PROGRESS });
    await addWorkOrderNote(tech, created.id, { body: "Ballast is scorched; isolating the circuit.", kind: NoteKind.PROGRESS });
    await transitionWorkOrder(tech, created.id, {
      toStatus: WorkOrderStatus.RESOLVED,
      resolutionNote: "Replaced the ballast and the lamp holder. No smell after 30 minutes.",
    });

    row = await db.workOrder.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe(WorkOrderStatus.RESOLVED);
    expect(row.resolvedAt).not.toBeNull();
    expect(row.originalReport).toBe("The hallway light near room 204 keeps flickering and smells burnt.");

    const actions = (await db.auditEvent.findMany({ where: { entityId: created.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(
      (event) => event.action,
    );
    expect(actions).toEqual([
      "work_order.created",
      "work_order.updated",
      "work_order.updated",
      "work_order.status_changed",
      "work_order.priority_confirmed",
      "work_order.assigned",
      "work_order.status_changed",
      "work_order.status_changed",
      "work_order.note_added",
      "work_order.status_changed",
    ]);
    const statusHistory = await db.statusEvent.findMany({
      where: { workOrderId: created.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(statusHistory.map((event) => event.toStatus)).toEqual(["SUBMITTED", "TRIAGE", "READY", "IN_PROGRESS", "RESOLVED"]);
    const resolution = await db.workOrderNote.findFirst({ where: { workOrderId: created.id, kind: NoteKind.RESOLUTION } });
    expect(resolution?.authorId).toBe(fixture.people.tech.id);
  });

  it("hands out sequential, per-workspace references", async () => {
    const first = await createWorkOrder(ctxFor(fixture.people.reporter), { originalReport: "Chair in Linden has a cracked base." });
    const second = await createWorkOrder(ctxFor(fixture.people.reporter), { originalReport: "Bin in courtyard is overflowing." });
    const foreign = await createWorkOrder(ctxFor(fixture.people.foreignAdmin), { originalReport: "Darkroom fan rattles loudly." });
    expect([first.reference, second.reference, foreign.reference]).toEqual(["WO-1001", "WO-1002", "WO-1001"]);
  });
});

describe("transition rules at the service boundary", () => {
  it("rejects illegal transitions with INVALID_TRANSITION and changes nothing", async () => {
    const order = await workOrderFor(fixture, { status: WorkOrderStatus.SUBMITTED, assigneeId: null });
    await expect(
      transitionWorkOrder(ctxFor(fixture.people.admin), order.id, { toStatus: WorkOrderStatus.RESOLVED, resolutionNote: "x" }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(WorkOrderStatus.SUBMITTED);
    expect(await db.auditEvent.count({ where: { entityId: order.id } })).toBe(0);
  });

  it("rejects resolution without a note", async () => {
    const order = await workOrderFor(fixture);
    const attempt = transitionWorkOrder(ctxFor(fixture.people.tech), order.id, { toStatus: WorkOrderStatus.RESOLVED });
    await expect(attempt).rejects.toBeInstanceOf(DomainError);
    await expect(attempt).rejects.toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { resolutionNote: expect.any(Array) } });
    expect((await db.workOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(WorkOrderStatus.IN_PROGRESS);
  });

  it("records actor and time on assignment and status audit events", async () => {
    const order = await workOrderFor(fixture, { status: WorkOrderStatus.TRIAGE, assigneeId: null });
    const before = Date.now();
    await updateWorkOrder(ctxFor(fixture.people.coordinator), order.id, { assigneeId: fixture.people.tech.id });
    await transitionWorkOrder(ctxFor(fixture.people.coordinator), order.id, { toStatus: WorkOrderStatus.READY });
    const events = await db.auditEvent.findMany({ where: { entityId: order.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(event.actorId).toBe(fixture.people.coordinator.id);
      expect(event.requestId).toBe("test-request");
      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before - 5000);
    }
    expect(events[0]?.details).toMatchObject({ from: null, to: { id: fixture.people.tech.id } });
    expect(events[1]?.details).toMatchObject({ from: "TRIAGE", to: "READY" });
  });

  it("detects a concurrent status change", async () => {
    const order = await workOrderFor(fixture);
    const tech = ctxFor(fixture.people.tech);
    const results = await Promise.allSettled([
      transitionWorkOrder(tech, order.id, { toStatus: WorkOrderStatus.BLOCKED, reason: "Waiting for parts" }),
      transitionWorkOrder(tech, order.id, { toStatus: WorkOrderStatus.RESOLVED, resolutionNote: "Done" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.statusEvent.count({ where: { workOrderId: order.id } })).toBe(1);
  });
});
