import { loginSchema } from "@/domain/schemas";
import { login } from "@/server/auth/login";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/session";
import { ok, publicRoute, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const POST = publicRoute(async (request, meta) => {
  const input = await readJson(request, loginSchema);
  const session = await login({
    ...input,
    previousToken: request.cookies.get(sessionCookieName())?.value,
    requestId: meta.requestId,
    ipHash: meta.ipHash,
  });
  const response = ok({ user: { name: session.user.name, role: session.user.role } });
  response.cookies.set(sessionCookieName(), session.token, sessionCookieOptions(session.expiresAt));
  return response;
});

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
