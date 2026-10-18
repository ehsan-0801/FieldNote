import "server-only";
import { DomainError } from "@/domain/errors";
import { recordAudit } from "../audit";
import { db } from "../db";
import { enforceRateLimit } from "../rate-limit";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { createSession, destroySession, resolveSessionToken } from "./session";

const INVALID_CREDENTIALS = "That email and password don’t match an active account.";

interface LoginRequest {
  email: string;
  password: string;
  previousToken?: string;
  requestId: string;
  ipHash: string | null;
}

/**
 * Verifies credentials and issues a fresh session. Any session the browser
 * already carried is destroyed first, so a session ID never survives a sign-in.
 */
export async function login(request: LoginRequest) {
  // Without a client IP (no proxy header) a shared bucket would let anyone lock everybody out,
  // so only the per-account limit applies.
  if (request.ipHash) await enforceRateLimit("loginIp", request.ipHash);
  await enforceRateLimit("loginEmail", request.email);

  const user = await db.user.findUnique({
    where: { email: request.email },
    select: { id: true, workspaceId: true, passwordHash: true, isActive: true },
  });
  const passwordOk = user ? await verifyPassword(request.password, user.passwordHash) : await verifyAgainstDummy(request.password);

  if (!user || !passwordOk || !user.isActive) {
    if (user) {
      await recordAudit(db, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.login_failed",
        entityType: "Session",
        entityId: user.id,
        requestId: request.requestId,
        ipHash: request.ipHash,
        details: { reason: user.isActive ? "bad_password" : "inactive" },
      });
    }
    throw new DomainError("UNAUTHENTICATED", INVALID_CREDENTIALS);
  }

  await destroySession(request.previousToken);
  const session = await createSession(user.id);
  await recordAudit(db, {
    workspaceId: user.workspaceId,
    actorId: user.id,
    action: "auth.login",
    entityType: "Session",
    entityId: user.id,
    requestId: request.requestId,
    ipHash: request.ipHash,
  });
  const sessionUser = await resolveSessionToken(session.token);
  if (!sessionUser) throw new DomainError("UNAUTHENTICATED", INVALID_CREDENTIALS);
  return { ...session, user: sessionUser };
}

export async function logout(token: string | undefined, requestId: string, ipHash: string | null): Promise<void> {
  const user = await resolveSessionToken(token);
  await destroySession(token);
  if (user) {
    await recordAudit(db, {
      workspaceId: user.workspaceId,
      actorId: user.id,
      action: "auth.logout",
      entityType: "Session",
      entityId: user.id,
      requestId,
      ipHash,
    });
  }
}
