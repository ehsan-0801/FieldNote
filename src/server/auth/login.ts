import "server-only";
import { DomainError } from "@/domain/errors";
import { recordAudit } from "../audit";
import { db } from "../db";
import { isProduction } from "../env";
import { assertUnderRateLimit, countAttempt, enforceRateLimit, pruneRateLimits } from "../rate-limit";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { createSession, destroySession, resolveSessionToken } from "./session";

const INVALID_CREDENTIALS = "That email and password don’t match an active account.";
// Development seed passwords; production refuses to sign anyone in with them.
const DEMO_PASSWORDS = new Set(["admin123", "fieldnote-demo-2026"]);

interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
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
  await assertUnderRateLimit("loginEmail", request.email);

  const user = await db.user.findUnique({
    where: { email: request.email },
    select: { id: true, workspaceId: true, passwordHash: true, isActive: true },
  });
  const passwordOk = user ? await verifyPassword(request.password, user.passwordHash) : await verifyAgainstDummy(request.password);

  const demoPasswordInProduction = isProduction() && DEMO_PASSWORDS.has(request.password);
  if (!user || !passwordOk || !user.isActive || demoPasswordInProduction) {
    await countAttempt("loginEmail", request.email);
    if (user) {
      await recordAudit(db, {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "auth.login_failed",
        entityType: "Session",
        entityId: user.id,
        requestId: request.requestId,
        ipHash: request.ipHash,
        details: { reason: !user.isActive ? "inactive" : demoPasswordInProduction && passwordOk ? "demo_password" : "bad_password" },
      });
    }
    throw new DomainError("UNAUTHENTICATED", INVALID_CREDENTIALS);
  }

  await destroySession(request.previousToken);
  // Opportunistic housekeeping on sign-in keeps session and rate-limit tables small.
  await Promise.all([db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }), pruneRateLimits()]);
  const session = await createSession(user.id, request.rememberMe === true);
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
