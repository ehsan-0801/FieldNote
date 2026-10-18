import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { createSession, sessionCookieName } from "@/server/auth/session";
import { db } from "@/server/db";
import type { ActorContext } from "@/server/request-context";

export const TEST_PASSWORD = "correct-horse-battery";
// Low bcrypt cost keeps fixtures fast; production hashing uses cost 12.
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

const TABLES = [
  "ChatMessage",
  "ChatConversation",
  "AuditEvent",
  "AiExtraction",
  "StatusEvent",
  "WorkOrderNote",
  "WorkOrder",
  "Session",
  "Category",
  "User",
  "Workspace",
  "RateLimitBucket",
];

export async function resetDatabase() {
  const schema = process.env.DATABASE_SCHEMA;
  if (!schema || schema === "public") throw new Error("Refusing to reset a non-test schema.");
  const tables = TABLES.map((table) => `"${schema}"."${table}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
}

async function user(workspaceId: string, key: string, role: Role, isActive = true) {
  return db.user.create({
    data: { workspaceId, email: `${key}@fixture.test`, name: key, role, isActive, passwordHash },
    select: { id: true, workspaceId: true, role: true, email: true, name: true },
  });
}

/** Two workspaces with every role, so each test can probe cross-user and cross-workspace access. */
export async function seedFixture() {
  await resetDatabase();
  const north = await db.workspace.create({ data: { name: "Northgate", slug: "northgate" } });
  const harbor = await db.workspace.create({ data: { name: "Harbor", slug: "harbor" } });
  const [electrical, foreignCategory] = await Promise.all([
    db.category.create({ data: { workspaceId: north.id, name: "Electrical", slug: "electrical" } }),
    db.category.create({ data: { workspaceId: harbor.id, name: "Electrical", slug: "electrical" } }),
  ]);
  const people = {
    admin: await user(north.id, "admin", Role.ADMIN),
    coordinator: await user(north.id, "coordinator", Role.COORDINATOR),
    tech: await user(north.id, "tech", Role.TECHNICIAN),
    otherTech: await user(north.id, "othertech", Role.TECHNICIAN),
    inactiveTech: await user(north.id, "inactivetech", Role.TECHNICIAN, false),
    reporter: await user(north.id, "reporter", Role.REPORTER),
    otherReporter: await user(north.id, "otherreporter", Role.REPORTER),
    foreignAdmin: await user(harbor.id, "foreignadmin", Role.ADMIN),
    foreignTech: await user(harbor.id, "foreigntech", Role.TECHNICIAN),
  };
  return { north, harbor, electrical, foreignCategory, people };
}

export type Fixture = Awaited<ReturnType<typeof seedFixture>>;
type FixtureUser = Fixture["people"][keyof Fixture["people"]];

export function ctxFor(person: FixtureUser): ActorContext {
  return { actor: { id: person.id, workspaceId: person.workspaceId, role: person.role }, requestId: "test-request", ipHash: null };
}

export async function workOrderFor(
  fixture: Fixture,
  overrides: { reporterId?: string; assigneeId?: string | null; status?: WorkOrderStatus; workspaceId?: string; reference?: string } = {},
) {
  return db.workOrder.create({
    data: {
      reference: overrides.reference ?? `WO-${Math.floor(Math.random() * 1e9)}`,
      workspaceId: overrides.workspaceId ?? fixture.north.id,
      reporterId: overrides.reporterId ?? fixture.people.reporter.id,
      assigneeId: overrides.assigneeId === undefined ? fixture.people.tech.id : overrides.assigneeId,
      title: "Flickering hallway light",
      originalReport: "The hallway light near room 204 keeps flickering and smells burnt.",
      status: overrides.status ?? WorkOrderStatus.IN_PROGRESS,
    },
  });
}

export async function sessionCookieFor(person: FixtureUser) {
  const { token } = await createSession(person.id);
  return `${sessionCookieName()}=${token}`;
}

export function apiRequest(
  path: string,
  init: { method?: string; cookie?: string; body?: unknown; origin?: string | null; rawBody?: string } = {},
) {
  const headers = new Headers({ host: "localhost:3000" });
  if (init.origin !== null) headers.set("origin", init.origin ?? "http://localhost:3000");
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body !== undefined || init.rawBody !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  });
}

export const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
