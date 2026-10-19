import { listConversations } from "@/server/assistant/service";
import { authedRoute, ok } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const GET = authedRoute(async (_request, ctx) => ok(await listConversations(ctx.actor)));

export const POST = methodNotAllowed("GET");
export const PUT = methodNotAllowed("GET");
export const PATCH = methodNotAllowed("GET");
export const DELETE = methodNotAllowed("GET");
