import { auditQuerySchema } from "@/domain/schemas";
import { listAuditLog } from "@/server/audit-log";
import { authedRoute, ok, parseOrThrow } from "@/server/http";

export const GET = authedRoute(async (request, ctx) => {
  const query = parseOrThrow(auditQuerySchema, Object.fromEntries(request.nextUrl.searchParams));
  const result = await listAuditLog(ctx.actor, query);
  return ok(result.events, { meta: { total: result.total, page: result.page, pageCount: result.pageCount } });
});
