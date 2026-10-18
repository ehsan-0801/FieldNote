import { listConversations } from "@/server/assistant/service";
import { authedRoute, ok } from "@/server/http";

export const GET = authedRoute(async (_request, ctx) => ok(await listConversations(ctx.actor)));
