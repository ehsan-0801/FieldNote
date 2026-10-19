import { deleteConversation, getConversation } from "@/server/assistant/service";
import { authedRoute, ok } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

type Params = { id: string };

export const GET = authedRoute<Params>(async (_request, ctx, { id }) => ok(await getConversation(ctx.actor, id)));

export const DELETE = authedRoute<Params>(async (_request, ctx, { id }) => {
  await deleteConversation(ctx.actor, id);
  return ok({ deleted: true });
});

export const POST = methodNotAllowed("GET", "DELETE");
export const PUT = methodNotAllowed("GET", "DELETE");
export const PATCH = methodNotAllowed("GET", "DELETE");
