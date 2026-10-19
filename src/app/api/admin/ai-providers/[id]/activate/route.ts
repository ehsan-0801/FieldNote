import { activateAiProvider } from "@/server/admin/ai-providers";
import { authedRoute, ok } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const POST = authedRoute<{ id: string }>(async (_request, ctx, { id }) => ok(await activateAiProvider(ctx, id)));

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
