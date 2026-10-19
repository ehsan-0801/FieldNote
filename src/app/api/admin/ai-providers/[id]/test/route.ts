import { testAiProvider } from "@/server/admin/ai-providers";
import { authedRoute, ok } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

// One short provider call, bounded by the test timeout.
export const maxDuration = 30;

export const POST = authedRoute<{ id: string }>(async (_request, ctx, { id }) => ok(await testAiProvider(ctx, id)));

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
