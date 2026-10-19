import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DomainError, ERROR_STATUS, type ErrorCode, type FieldErrors } from "@/domain/errors";
import { requireRequestUser, type SessionUser } from "./auth/session";
import { enforceRateLimit } from "./rate-limit";
import { isProduction, serverEnv } from "./env";
import { clientIp, hashIp, newRequestId, type ActorContext } from "./request-context";

export const MAX_JSON_BYTES = 32 * 1024;

export function ok<T>(data: T, init?: { status?: number; meta?: Record<string, unknown> }) {
  return NextResponse.json({ data, meta: init?.meta ?? {} }, { status: init?.status ?? 200 });
}

function errorResponse(code: ErrorCode, message: string, requestId: string, fieldErrors?: FieldErrors) {
  return NextResponse.json(
    { error: { code, message, requestId, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status: ERROR_STATUS[code], headers: { "x-request-id": requestId } },
  );
}

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  // Null prototype: keys such as "__proto__" in a crafted body must not reach Object.prototype.
  const fieldErrors: FieldErrors = Object.create(null);
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    // Unknown-key issues name the offending keys; surface them under each key.
    if (issue.code === "unrecognized_keys") {
      for (const unknownKey of issue.keys) (fieldErrors[unknownKey] ??= []).push("This field can’t be set.");
      continue;
    }
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("VALIDATION_ERROR", "Some fields need attention.", zodFieldErrors(parsed.error));
  }
  return parsed.data;
}

export async function readJson<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new DomainError("VALIDATION_ERROR", "Send the request body as JSON.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_JSON_BYTES) throw new DomainError("PAYLOAD_TOO_LARGE", "This request is too large.");
  const text = await readCapped(request);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DomainError("VALIDATION_ERROR", "The request body isn’t valid JSON.");
  }
  return parseOrThrow(schema, body);
}

/** Reads the body as a stream and stops at the limit, so a lying or missing Content-Length can't exhaust memory. */
async function readCapped(request: NextRequest): Promise<string> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_JSON_BYTES) {
      await reader.cancel();
      throw new DomainError("PAYLOAD_TOO_LARGE", "This request is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const CROSS_SITE = "This request didn’t come from Fieldnote Atlas.";

/** APP_ORIGIN, plus the deployment URLs Vercel provides so previews work without extra setup. */
function allowedOrigins(): string[] {
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
  return [...serverEnv().APP_ORIGIN, ...vercel];
}

/**
 * Cookie sessions plus SameSite=Lax already block most cross-site writes; this
 * also rejects any state-changing request whose Origin isn't this site. When
 * APP_ORIGIN is configured it is the only accepted origin, so a spoofed Host or
 * X-Forwarded-Host header can't make a foreign origin look local.
 */
function assertSameOrigin(request: NextRequest): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) throw new DomainError("FORBIDDEN", CROSS_SITE);
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new DomainError("FORBIDDEN", CROSS_SITE);
  }
  const allowed = allowedOrigins();
  if (allowed.length > 0) {
    if (!allowed.includes(originUrl.origin)) throw new DomainError("FORBIDDEN", CROSS_SITE);
    return;
  }
  // Production must know its own origin; trusting the Host header there would let a spoofed
  // Host make a foreign Origin look local. Fail closed and say why in the server log.
  if (isProduction()) {
    console.error("APP_ORIGIN is not set; refusing state-changing requests.");
    throw new DomainError("FORBIDDEN", CROSS_SITE);
  }
  const host = request.headers.get("host");
  if (!host || originUrl.host !== host) throw new DomainError("FORBIDDEN", CROSS_SITE);
}

export interface RequestMeta {
  requestId: string;
  ipHash: string | null;
}

type Handler<P> = (request: NextRequest, meta: RequestMeta, params: P) => Promise<Response>;
type AuthedHandler<P> = (request: NextRequest, ctx: ActorContext & { user: SessionUser }, params: P) => Promise<Response>;

/** Public endpoint wrapper: request ID, origin check, and safe error mapping. */
export function publicRoute<P = Record<string, never>>(handler: Handler<P>) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    const requestId = newRequestId();
    try {
      assertSameOrigin(request);
      const meta = { requestId, ipHash: hashIp(clientIp(request.headers)) };
      const response = await handler(request, meta, await context.params);
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      return handleError(error, requestId);
    }
  };
}

/** Authenticated endpoint wrapper: everything in publicRoute plus a verified, active session. */
export function authedRoute<P = Record<string, never>>(handler: AuthedHandler<P>) {
  return publicRoute<P>(async (request, meta, params) => {
    const user = await requireRequestUser(request);
    if (request.method !== "GET") await enforceRateLimit("mutation", user.id);
    const actor = { id: user.id, workspaceId: user.workspaceId, role: user.role };
    return handler(request, { actor, user, ...meta }, params);
  });
}

function handleError(error: unknown, requestId: string): Response {
  // Next.js signals prerender bail-outs, redirects and notFound() by throwing; those aren't ours to handle.
  unstable_rethrow(error);
  if (error instanceof DomainError) {
    return errorResponse(error.code, error.message, requestId, error.fieldErrors);
  }
  // Log the failure class, any driver error code and where it was thrown — never the message,
  // which can contain report text or SQL.
  const kind = error instanceof Error ? error.name : typeof error;
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? ` code=${error.code}` : "";
  const origin =
    error instanceof Error
      ? (error.stack
          ?.split("\n")
          .find((line) => line.includes("/src/"))
          ?.trim() ?? "")
      : "";
  console.error(`[${requestId}] unhandled ${kind}${code} ${origin}`.trimEnd());
  return errorResponse("INTERNAL_ERROR", "Something went wrong on our side. Try again in a moment.", requestId);
}
