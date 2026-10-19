import { auditQuerySchema } from "@/domain/schemas";
import { listAuditLog } from "@/server/audit-log";
import { authedRoute, ok, parseOrThrow } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const GET = authedRoute(async (request, ctx) => {
  const query = parseOrThrow(auditQuerySchema, Object.fromEntries(request.nextUrl.searchParams));
  const result = await listAuditLog(ctx.actor, query);
  return ok(result.events, { meta: { total: result.total, page: result.page, pageCount: result.pageCount } });
});

export const POST = methodNotAllowed("GET");
export const PUT = methodNotAllowed("GET");
export const PATCH = methodNotAllowed("GET");
export const DELETE = methodNotAllowed("GET");
