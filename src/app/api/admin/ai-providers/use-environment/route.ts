import { switchToEnvironmentDefault } from "@/server/admin/ai-providers";
import { authedRoute, ok } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

/** Deactivates every workspace configuration so the environment settings apply again. */
export const POST = authedRoute(async (_request, ctx) => ok(await switchToEnvironmentDefault(ctx)));

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
