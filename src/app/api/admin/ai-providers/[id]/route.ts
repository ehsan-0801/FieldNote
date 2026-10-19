import { updateAiProviderSchema } from "@/domain/ai-providers";
import { deleteAiProvider, updateAiProvider } from "@/server/admin/ai-providers";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const PATCH = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, updateAiProviderSchema);
  return ok(await updateAiProvider(ctx, id, input));
});

export const DELETE = authedRoute<{ id: string }>(async (_request, ctx, { id }) => ok(await deleteAiProvider(ctx, id)));

export const GET = methodNotAllowed("PATCH", "DELETE");
export const POST = methodNotAllowed("PATCH", "DELETE");
export const PUT = methodNotAllowed("PATCH", "DELETE");
