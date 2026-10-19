import { createCategorySchema } from "@/domain/schemas";
import { createCategory, listCategories } from "@/server/admin/categories";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const GET = authedRoute(async (_request, ctx) => ok(await listCategories(ctx.actor)));

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, createCategorySchema);
  return ok(await createCategory(ctx, input), { status: 201 });
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = methodNotAllowed("GET", "POST");
export const DELETE = methodNotAllowed("GET", "POST");
