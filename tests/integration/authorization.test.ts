import { beforeEach, describe, expect, it } from "vitest";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { DomainError } from "@/domain/errors";
import { workOrderListQuerySchema } from "@/domain/schemas";
import { updateUser } from "@/server/admin/users";
import { db } from "@/server/db";
import { addWorkOrderNote, transitionWorkOrder, updateWorkOrder } from "@/server/work-orders/commands";
import { getWorkOrderDetail, listWorkOrders } from "@/server/work-orders/queries";
import { ctxFor, seedFixture, workOrderFor, type Fixture } from "../support/fixtures";

let fixture: Fixture;
beforeEach(async () => {
  fixture = await seedFixture();
});

async function expectCode(promise: Promise<unknown>, code: DomainError["code"]) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof DomainError && error.code === code);
}

const defaultQuery = workOrderListQuerySchema.parse({});

describe("reporter isolation (IDOR)", () => {
  it("lets a reporter open their own report", async () => {
    const own = await workOrderFor(fixture);
    const detail = await getWorkOrderDetail(ctxFor(fixture.people.reporter).actor, own.id);
    expect(detail.workOrder.id).toBe(own.id);
    expect(detail.relation).toBe("reporter");
  });

  it("returns NOT_FOUND for another reporter's report on every path", async () => {
    const theirs = await workOrderFor(fixture);
    const intruder = ctxFor(fixture.people.otherReporter);
    await expectCode(getWorkOrderDetail(intruder.actor, theirs.id), "NOT_FOUND");
    await expectCode(updateWorkOrder(intruder, theirs.id, { title: "Hijacked" }), "NOT_FOUND");
    await expectCode(addWorkOrderNote(intruder, theirs.id, { body: "hello", kind: "COMMENT" }), "NOT_FOUND");
    await expectCode(transitionWorkOrder(intruder, theirs.id, { toStatus: WorkOrderStatus.TRIAGE }), "NOT_FOUND");
  });

  it("lists only the reporter's own work", async () => {
    await workOrderFor(fixture);
    await workOrderFor(fixture, { reporterId: fixture.people.otherReporter.id });
    const result = await listWorkOrders(ctxFor(fixture.people.reporter).actor, defaultQuery);
    expect(result.total).toBe(1);
  });
});

describe("technician scope", () => {
  it("hides unassigned work orders from a technician", async () => {
    const assignedToOther = await workOrderFor(fixture, { assigneeId: fixture.people.otherTech.id });
    await expectCode(getWorkOrderDetail(ctxFor(fixture.people.tech).actor, assignedToOther.id), "NOT_FOUND");
    const list = await listWorkOrders(ctxFor(fixture.people.tech).actor, defaultQuery);
    expect(list.items.map((item) => item.id)).not.toContain(assignedToOther.id);
  });

  it("refuses self-assignment and triage edits through crafted payloads", async () => {
    const assigned = await workOrderFor(fixture);
    const unassigned = await workOrderFor(fixture, { assigneeId: null, status: WorkOrderStatus.TRIAGE });
    const tech = ctxFor(fixture.people.tech);
    await expectCode(updateWorkOrder(tech, assigned.id, { assigneeId: fixture.people.otherTech.id }), "FORBIDDEN");
    await expectCode(updateWorkOrder(tech, unassigned.id, { assigneeId: fixture.people.tech.id }), "NOT_FOUND");
    await expectCode(updateWorkOrder(tech, assigned.id, { title: "Mine now" }), "FORBIDDEN");
    await expectCode(
      updateWorkOrder(tech, assigned.id, {
        factors: { safetyFlag: true, essentialServiceDown: true, multiplePeopleAffected: true, worsening: true },
      }),
      "FORBIDDEN",
    );
    const after = await db.workOrder.findUniqueOrThrow({ where: { id: assigned.id } });
    expect(after.assigneeId).toBe(fixture.people.tech.id);
    expect(after.title).toBe("Flickering hallway light");
  });

  it("lets the assigned technician correct on-site facts", async () => {
    const assigned = await workOrderFor(fixture);
    await updateWorkOrder(ctxFor(fixture.people.tech), assigned.id, { locationLabel: "Level 2 corridor, by room 204" });
    const after = await db.workOrder.findUniqueOrThrow({ where: { id: assigned.id } });
    expect(after.locationLabel).toBe("Level 2 corridor, by room 204");
  });

  it("cannot change any role, including their own", async () => {
    await expectCode(updateUser(ctxFor(fixture.people.tech), fixture.people.tech.id, { role: Role.ADMIN }), "FORBIDDEN");
    const after = await db.user.findUniqueOrThrow({ where: { id: fixture.people.tech.id } });
    expect(after.role).toBe(Role.TECHNICIAN);
  });
});

describe("workspace isolation", () => {
  it("hides other workspaces' work orders even from their admins", async () => {
    const northOrder = await workOrderFor(fixture);
    const foreign = ctxFor(fixture.people.foreignAdmin);
    await expectCode(getWorkOrderDetail(foreign.actor, northOrder.id), "NOT_FOUND");
    await expectCode(transitionWorkOrder(foreign, northOrder.id, { toStatus: WorkOrderStatus.BLOCKED, reason: "x" }), "NOT_FOUND");
    expect((await listWorkOrders(foreign.actor, defaultQuery)).total).toBe(0);
  });

  it("rejects assignees and categories from another workspace", async () => {
    const order = await workOrderFor(fixture, { status: WorkOrderStatus.TRIAGE, assigneeId: null });
    const coordinator = ctxFor(fixture.people.coordinator);
    await expectCode(updateWorkOrder(coordinator, order.id, { assigneeId: fixture.people.foreignTech.id }), "VALIDATION_ERROR");
    await expectCode(updateWorkOrder(coordinator, order.id, { categoryId: fixture.foreignCategory.id }), "VALIDATION_ERROR");
  });

  it("rejects inactive and non-technician assignees", async () => {
    const order = await workOrderFor(fixture, { status: WorkOrderStatus.TRIAGE, assigneeId: null });
    const coordinator = ctxFor(fixture.people.coordinator);
    await expectCode(updateWorkOrder(coordinator, order.id, { assigneeId: fixture.people.inactiveTech.id }), "VALIDATION_ERROR");
    await expectCode(updateWorkOrder(coordinator, order.id, { assigneeId: fixture.people.reporter.id }), "VALIDATION_ERROR");
  });

  it("does not let an admin manage another workspace's accounts", async () => {
    await expectCode(updateUser(ctxFor(fixture.people.admin), fixture.people.foreignTech.id, { isActive: false }), "NOT_FOUND");
  });
});

describe("account administration", () => {
  it("keeps coordinators out of user management", async () => {
    await expectCode(updateUser(ctxFor(fixture.people.coordinator), fixture.people.reporter.id, { role: Role.COORDINATOR }), "FORBIDDEN");
  });

  it("stops admins demoting or deactivating themselves", async () => {
    await expectCode(updateUser(ctxFor(fixture.people.admin), fixture.people.admin.id, { role: Role.REPORTER }), "FORBIDDEN");
  });

  it("releases open work and audits it when a technician is deactivated", async () => {
    const order = await workOrderFor(fixture);
    await updateUser(ctxFor(fixture.people.admin), fixture.people.tech.id, { isActive: false });
    const after = await db.workOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.assigneeId).toBeNull();
    const events = await db.auditEvent.findMany({ where: { entityId: { in: [order.id, fixture.people.tech.id] } } });
    expect(events.map((event) => event.action).sort()).toEqual(["user.deactivated", "work_order.assigned"]);
  });
});
