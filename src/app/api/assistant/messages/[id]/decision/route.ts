import { actionDecisionSchema } from "@/domain/assistant";
import { decideAssistantAction } from "@/server/assistant/service";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const POST = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const { decision } = await readJson(request, actionDecisionSchema);
  return ok(await decideAssistantAction(ctx, id, decision));
});

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
