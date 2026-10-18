import { createCategorySchema } from "@/domain/schemas";
import { createCategory, listCategories } from "@/server/admin/categories";
import { authedRoute, ok, readJson } from "@/server/http";

export const GET = authedRoute(async (_request, ctx) => ok(await listCategories(ctx.actor)));

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, createCategorySchema);
  return ok(await createCategory(ctx, input), { status: 201 });
});
