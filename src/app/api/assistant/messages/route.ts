import { sendMessageSchema } from "@/domain/assistant";
import { sendAssistantMessage } from "@/server/assistant/service";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

// A turn can include several model calls; see ASSISTANT_BUDGET_MS in the service.
export const maxDuration = 60;

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, sendMessageSchema);
  return ok(await sendAssistantMessage(ctx, input), { status: 201 });
});

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
