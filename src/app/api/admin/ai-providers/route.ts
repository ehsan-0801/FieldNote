import { createAiProviderSchema } from "@/domain/ai-providers";
import { createAiProvider, listAiProviders } from "@/server/admin/ai-providers";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

// Adding a provider looks up its models and sends one test prompt, each bounded by the test timeout.
export const maxDuration = 60;

export const GET = authedRoute(async (_request, ctx) => ok(await listAiProviders(ctx.actor)));

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, createAiProviderSchema);
  return ok(await createAiProvider(ctx, input), { status: 201 });
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = methodNotAllowed("GET", "POST");
export const DELETE = methodNotAllowed("GET", "POST");
