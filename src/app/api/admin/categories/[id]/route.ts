import { updateCategorySchema } from "@/domain/schemas";
import { updateCategory } from "@/server/admin/categories";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const PATCH = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, updateCategorySchema);
  return ok(await updateCategory(ctx, id, input));
});

export const GET = methodNotAllowed("PATCH");
export const POST = methodNotAllowed("PATCH");
export const PUT = methodNotAllowed("PATCH");
export const DELETE = methodNotAllowed("PATCH");
