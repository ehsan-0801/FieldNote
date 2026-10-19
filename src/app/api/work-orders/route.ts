import { createWorkOrderSchema, workOrderListQuerySchema } from "@/domain/schemas";
import { authedRoute, ok, parseOrThrow, readJson } from "@/server/http";
import { createWorkOrder } from "@/server/work-orders/commands";
import { listWorkOrders } from "@/server/work-orders/queries";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const GET = authedRoute(async (request, ctx) => {
  const query = parseOrThrow(workOrderListQuerySchema, Object.fromEntries(request.nextUrl.searchParams));
  const result = await listWorkOrders(ctx.actor, query);
  return ok(result.items, { meta: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
});

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, createWorkOrderSchema);
  const workOrder = await createWorkOrder(ctx, input);
  return ok(workOrder, { status: 201 });
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = methodNotAllowed("GET", "POST");
export const DELETE = methodNotAllowed("GET", "POST");
