import { transitionSchema } from "@/domain/schemas";
import { authedRoute, ok, readJson } from "@/server/http";
import { transitionWorkOrder } from "@/server/work-orders/commands";

export const POST = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, transitionSchema);
  return ok(await transitionWorkOrder(ctx, id, input));
});
