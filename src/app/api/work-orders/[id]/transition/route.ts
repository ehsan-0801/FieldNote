import { transitionSchema } from "@/domain/schemas";
import { authedRoute, ok, readJson } from "@/server/http";
import { transitionWorkOrder } from "@/server/work-orders/commands";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const POST = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, transitionSchema);
  return ok(await transitionWorkOrder(ctx, id, input));
});

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
