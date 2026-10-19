import { updateUserSchema } from "@/domain/schemas";
import { updateUser } from "@/server/admin/users";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const PATCH = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, updateUserSchema);
  return ok(await updateUser(ctx, id, input));
});

export const GET = methodNotAllowed("PATCH");
export const POST = methodNotAllowed("PATCH");
export const PUT = methodNotAllowed("PATCH");
export const DELETE = methodNotAllowed("PATCH");
