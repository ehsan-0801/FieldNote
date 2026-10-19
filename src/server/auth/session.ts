import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { DomainError } from "@/domain/errors";
import { db } from "../db";
import { isProduction } from "../env";

const DAY_MS = 24 * 60 * 60 * 1000;
/** "Remember me" keeps a session for 30 days; otherwise it lasts one day. */
export const SESSION_TTL_MS = { remembered: 30 * DAY_MS, standard: DAY_MS } as const;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/** `__Host-` forces Secure, Path=/ and no Domain, which is what we want in production. */
export function sessionCookieName(): string {
  return isProduction() ? "__Host-fieldnote_session" : "fieldnote_session";
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export interface SessionUser {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
  name: string;
  email: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, remember = false): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (remember ? SESSION_TTL_MS.remembered : SESSION_TTL_MS.standard));
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Ends every session a user holds; used on role change and deactivation. */
export async function destroyUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/** Resolves a raw cookie token to an active user, or null. Inactive or expired → null. */
export async function resolveSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 128) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      lastSeenAt: true,
      user: {
        select: {
          id: true,
          workspaceId: true,
          role: true,
          name: true,
          email: true,
          isActive: true,
          workspace: { select: { name: true } },
        },
      },
    },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || !session.user.isActive) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }

  const { user } = session;
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    workspaceName: user.workspace.name,
    role: user.role,
    name: user.name,
    email: user.email,
  };
}

/** For Server Components: the signed-in user for this request, deduplicated per render. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return resolveSessionToken(store.get(sessionCookieName())?.value);
});

/** For pages: redirects to sign-in when there is no valid session. */
export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For Route Handlers: reads the cookie from the request itself. */
export async function requireRequestUser(request: { cookies: { get(name: string): { value: string } | undefined } }): Promise<SessionUser> {
  const user = await resolveSessionToken(request.cookies.get(sessionCookieName())?.value);
  if (!user) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.");
  return user;
}
