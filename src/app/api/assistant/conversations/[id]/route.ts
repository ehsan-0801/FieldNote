import { deleteConversation, getConversation } from "@/server/assistant/service";
import { authedRoute, ok } from "@/server/http";

type Params = { id: string };

export const GET = authedRoute<Params>(async (_request, ctx, { id }) => ok(await getConversation(ctx.actor, id)));

export const DELETE = authedRoute<Params>(async (_request, ctx, { id }) => {
  await deleteConversation(ctx.actor, id);
  return ok({ deleted: true });
});
