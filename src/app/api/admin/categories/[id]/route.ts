import { updateCategorySchema } from "@/domain/schemas";
import { updateCategory } from "@/server/admin/categories";
import { authedRoute, ok, readJson } from "@/server/http";

export const PATCH = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, updateCategorySchema);
  return ok(await updateCategory(ctx, id, input));
});
