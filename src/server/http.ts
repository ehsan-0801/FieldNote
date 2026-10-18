import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DomainError, ERROR_STATUS, type ErrorCode, type FieldErrors } from "@/domain/errors";
import { requireRequestUser, type SessionUser } from "./auth/session";
import { enforceRateLimit } from "./rate-limit";
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
  const fieldErrors: FieldErrors = {};
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
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_JSON_BYTES) throw new DomainError("PAYLOAD_TOO_LARGE", "This request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new DomainError("VALIDATION_ERROR", "The request body isn’t valid JSON.");
  }
  return parseOrThrow(schema, body);
}

/**
 * Cookie sessions plus SameSite=Lax already block most cross-site writes; this
 * also rejects any state-changing request whose Origin isn't this site.
 */
function assertSameOrigin(request: NextRequest): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new DomainError("FORBIDDEN", "This request didn’t come from Fieldnote Atlas.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new DomainError("FORBIDDEN", "This request didn’t come from Fieldnote Atlas.");
  }
  if (originHost !== host) throw new DomainError("FORBIDDEN", "This request didn’t come from Fieldnote Atlas.");
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
  // Log the failure class and request ID only; messages can contain report text or SQL.
  const kind = error instanceof Error ? error.name : typeof error;
  console.error(`[${requestId}] unhandled ${kind}`);
  return errorResponse("INTERNAL_ERROR", "Something went wrong on our side. Try again in a moment.", requestId);
}
