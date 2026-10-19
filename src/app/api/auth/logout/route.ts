import { logout } from "@/server/auth/login";
import { sessionCookieName, sessionCookieOptions } from "@/server/auth/session";
import { ok, publicRoute } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const POST = publicRoute(async (request, meta) => {
  await logout(request.cookies.get(sessionCookieName())?.value, meta.requestId, meta.ipHash);
  const response = ok({ signedOut: true });
  response.cookies.set(sessionCookieName(), "", sessionCookieOptions(new Date(0)));
  return response;
});

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
