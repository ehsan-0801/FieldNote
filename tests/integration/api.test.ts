import { beforeEach, describe, expect, it } from "vitest";
import { Role, WorkOrderStatus } from "@/generated/prisma/enums";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as listUsers, POST as createUser } from "@/app/api/admin/users/route";
import { PATCH as patchUser } from "@/app/api/admin/users/[id]/route";
import { GET as listWorkOrders, POST as createWorkOrder } from "@/app/api/work-orders/route";
import { GET as getWorkOrder, PATCH as patchWorkOrder } from "@/app/api/work-orders/[id]/route";
import { POST as transition } from "@/app/api/work-orders/[id]/transition/route";
import { MAX_JSON_BYTES } from "@/server/http";
import { SESSION_TTL_MS, resolveSessionToken, sessionCookieName } from "@/server/auth/session";
import { db } from "@/server/db";
import { TEST_PASSWORD, apiRequest, params, seedFixture, sessionCookieFor, workOrderFor, type Fixture } from "../support/fixtures";

let fixture: Fixture;
beforeEach(async () => {
  fixture = await seedFixture();
});

const noParams = params({});
const tokenFrom = (response: Response) => {
  const header = response.headers.get("set-cookie") ?? "";
  return new RegExp(`${sessionCookieName()}=([^;]*)`).exec(header)?.[1];
};

describe("authentication", () => {
  it("returns 401 with the error envelope when there is no session", async () => {
    const response = await listWorkOrders(apiRequest("/api/work-orders"), noParams);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "UNAUTHENTICATED", requestId: expect.any(String) });
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|at \w+ \(/i);
  });

  it("signs in with an HttpOnly SameSite cookie and rotates any previous session", async () => {
    const oldCookie = await sessionCookieFor(fixture.people.reporter);
    const oldToken = oldCookie.split("=")[1];
    const response = await login(
      apiRequest("/api/auth/login", {
        method: "POST",
        cookie: oldCookie,
        body: { email: "reporter@fixture.test", password: TEST_PASSWORD },
      }),
      noParams,
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    const newToken = tokenFrom(response);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    expect(await resolveSessionToken(oldToken)).toBeNull();
    expect(await resolveSessionToken(newToken)).toMatchObject({ id: fixture.people.reporter.id });
  });

  it("gives the same answer for a wrong password, an unknown email and an inactive account", async () => {
    const attempts = [
      { email: "reporter@fixture.test", password: "wrong-password" },
      { email: "nobody@fixture.test", password: TEST_PASSWORD },
      { email: "inactivetech@fixture.test", password: TEST_PASSWORD },
    ];
    const messages = new Set<string>();
    for (const body of attempts) {
      const response = await login(apiRequest("/api/auth/login", { method: "POST", body }), noParams);
      expect(response.status).toBe(401);
      messages.add((await response.json()).error.message);
    }
    expect(messages.size).toBe(1);
  });

  it("rejects expired sessions", async () => {
    const cookie = await sessionCookieFor(fixture.people.admin);
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const response = await listUsers(apiRequest("/api/admin/users", { cookie }), noParams);
    expect(response.status).toBe(401);
    expect(SESSION_TTL_MS).toBeGreaterThan(0);
  });

  it("ends the session on sign-out", async () => {
    const cookie = await sessionCookieFor(fixture.people.reporter);
    await logout(apiRequest("/api/auth/logout", { method: "POST", cookie }), noParams);
    expect(await resolveSessionToken(cookie.split("=")[1])).toBeNull();
  });

  it("rate-limits repeated sign-in attempts", async () => {
    let last: Response | undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      last = await login(
        apiRequest("/api/auth/login", { method: "POST", body: { email: "reporter@fixture.test", password: "nope-nope" } }),
        noParams,
      );
    }
    expect(last?.status).toBe(429);
    expect((await last?.json()).error.code).toBe("RATE_LIMITED");
  });
});

describe("request hygiene", () => {
  it("rejects cross-origin and origin-less writes", async () => {
    const cookie = await sessionCookieFor(fixture.people.reporter);
    const body = { originalReport: "The hallway light keeps flickering." };
    const evil = await createWorkOrder(
      apiRequest("/api/work-orders", { method: "POST", cookie, body, origin: "https://evil.example" }),
      noParams,
    );
    expect(evil.status).toBe(403);
    const missing = await createWorkOrder(apiRequest("/api/work-orders", { method: "POST", cookie, body, origin: null }), noParams);
    expect(missing.status).toBe(403);
    expect(await db.workOrder.count()).toBe(0);
  });

  it("rejects oversized bodies with 413", async () => {
    const cookie = await sessionCookieFor(fixture.people.reporter);
    const rawBody = JSON.stringify({ originalReport: "x".repeat(MAX_JSON_BYTES) });
    const response = await createWorkOrder(apiRequest("/api/work-orders", { method: "POST", cookie, rawBody }), noParams);
    expect(response.status).toBe(413);
  });

  it("rejects crafted authority fields with VALIDATION_ERROR naming them", async () => {
    const cookie = await sessionCookieFor(fixture.people.reporter);
    const response = await createWorkOrder(
      apiRequest("/api/work-orders", {
        method: "POST",
        cookie,
        body: {
          originalReport: "The hallway light keeps flickering.",
          reporterId: fixture.people.otherReporter.id,
          workspaceId: fixture.harbor.id,
        },
      }),
      noParams,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.error.fieldErrors)).toEqual(expect.arrayContaining(["reporterId", "workspaceId"]));
  });

  it("creates a report owned by the session user with a 201 envelope", async () => {
    const cookie = await sessionCookieFor(fixture.people.reporter);
    const response = await createWorkOrder(
      apiRequest("/api/work-orders", {
        method: "POST",
        cookie,
        body: { originalReport: "The hallway light near room 204 keeps flickering." },
      }),
      noParams,
    );
    expect(response.status).toBe(201);
    const { data, meta } = await response.json();
    expect(meta).toEqual({});
    const row = await db.workOrder.findUniqueOrThrow({ where: { id: data.id } });
    expect(row.reporterId).toBe(fixture.people.reporter.id);
    expect(row.workspaceId).toBe(fixture.north.id);
  });
});

describe("object-level access over HTTP", () => {
  it("returns the same 404 for another reporter's ID and a made-up ID", async () => {
    const theirs = await workOrderFor(fixture);
    const cookie = await sessionCookieFor(fixture.people.otherReporter);
    const real = await getWorkOrder(apiRequest(`/api/work-orders/${theirs.id}`, { cookie }), params({ id: theirs.id }));
    const fake = await getWorkOrder(
      apiRequest("/api/work-orders/cmzzzzzzzzzzzzzzzzzzzzzzz", { cookie }),
      params({ id: "cmzzzzzzzzzzzzzzzzzzzzzzz" }),
    );
    expect(real.status).toBe(404);
    expect(fake.status).toBe(404);
    expect((await real.json()).error.message).toBe((await fake.json()).error.message);
  });

  it("returns 404 to a technician for unassigned work", async () => {
    const order = await workOrderFor(fixture, { assigneeId: fixture.people.otherTech.id });
    const cookie = await sessionCookieFor(fixture.people.tech);
    const response = await getWorkOrder(apiRequest(`/api/work-orders/${order.id}`, { cookie }), params({ id: order.id }));
    expect(response.status).toBe(404);
  });

  it("returns 403 when a technician tries to assign through PATCH", async () => {
    const order = await workOrderFor(fixture);
    const cookie = await sessionCookieFor(fixture.people.tech);
    const response = await patchWorkOrder(
      apiRequest(`/api/work-orders/${order.id}`, { method: "PATCH", cookie, body: { assigneeId: fixture.people.otherTech.id } }),
      params({ id: order.id }),
    );
    expect(response.status).toBe(403);
  });

  it("returns 409 INVALID_TRANSITION for an illegal move", async () => {
    const order = await workOrderFor(fixture, { status: WorkOrderStatus.READY });
    const cookie = await sessionCookieFor(fixture.people.coordinator);
    const response = await transition(
      apiRequest(`/api/work-orders/${order.id}/transition`, { method: "POST", cookie, body: { toStatus: "CLOSED" } }),
      params({ id: order.id }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INVALID_TRANSITION");
  });
});

describe("admin endpoints", () => {
  it("refuses user management to coordinators", async () => {
    const cookie = await sessionCookieFor(fixture.people.coordinator);
    const list = await listUsers(apiRequest("/api/admin/users", { cookie }), noParams);
    expect(list.status).toBe(403);
    const create = await createUser(
      apiRequest("/api/admin/users", {
        method: "POST",
        cookie,
        body: { name: "Mallory", email: "mallory@fixture.test", role: "ADMIN", password: "long-enough-password" },
      }),
      noParams,
    );
    expect(create.status).toBe(403);
    expect(await db.user.count({ where: { email: "mallory@fixture.test" } })).toBe(0);
  });

  it("revokes sessions when an admin changes someone's role", async () => {
    const reporterCookie = await sessionCookieFor(fixture.people.reporter);
    const adminCookie = await sessionCookieFor(fixture.people.admin);
    const response = await patchUser(
      apiRequest(`/api/admin/users/${fixture.people.reporter.id}`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { role: Role.COORDINATOR },
      }),
      params({ id: fixture.people.reporter.id }),
    );
    expect(response.status).toBe(200);
    expect(await resolveSessionToken(reporterCookie.split("=")[1])).toBeNull();
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "user.role_changed", entityId: fixture.people.reporter.id } });
    expect(audit.details).toMatchObject({ from: "REPORTER", to: "COORDINATOR" });
    expect(audit.actorId).toBe(fixture.people.admin.id);
  });

  it("never returns password hashes", async () => {
    const cookie = await sessionCookieFor(fixture.people.admin);
    const response = await listUsers(apiRequest("/api/admin/users", { cookie }), noParams);
    expect(JSON.stringify(await response.json())).not.toMatch(/passwordHash|\$2[aby]\$/);
  });
});
