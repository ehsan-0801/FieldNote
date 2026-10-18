import { sendMessageSchema } from "@/domain/assistant";
import { sendAssistantMessage } from "@/server/assistant/service";
import { authedRoute, ok, readJson } from "@/server/http";

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, sendMessageSchema);
  return ok(await sendAssistantMessage(ctx, input), { status: 201 });
});
