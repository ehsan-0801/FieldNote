import { updateUserSchema } from "@/domain/schemas";
import { updateUser } from "@/server/admin/users";
import { authedRoute, ok, readJson } from "@/server/http";

export const PATCH = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, updateUserSchema);
  return ok(await updateUser(ctx, id, input));
});
