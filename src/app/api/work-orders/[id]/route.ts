import { updateWorkOrderSchema } from "@/domain/schemas";
import { authedRoute, ok, readJson } from "@/server/http";
import { updateWorkOrder } from "@/server/work-orders/commands";
import { getWorkOrderDetail } from "@/server/work-orders/queries";

type Params = { id: string };

export const GET = authedRoute<Params>(async (_request, ctx, { id }) => {
  const detail = await getWorkOrderDetail(ctx.actor, id);
  return ok(detail);
});

export const PATCH = authedRoute<Params>(async (request, ctx, { id }) => {
  const input = await readJson(request, updateWorkOrderSchema);
  return ok(await updateWorkOrder(ctx, id, input));
});
