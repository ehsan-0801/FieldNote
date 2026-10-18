import { actionDecisionSchema } from "@/domain/assistant";
import { decideAssistantAction } from "@/server/assistant/service";
import { authedRoute, ok, readJson } from "@/server/http";

export const POST = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const { decision } = await readJson(request, actionDecisionSchema);
  return ok(await decideAssistantAction(ctx, id, decision));
});
