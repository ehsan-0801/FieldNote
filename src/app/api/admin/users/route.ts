import { createUserSchema } from "@/domain/schemas";
import { createUser, listUsers } from "@/server/admin/users";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const GET = authedRoute(async (_request, ctx) => ok(await listUsers(ctx.actor)));

export const POST = authedRoute(async (request, ctx) => {
  const input = await readJson(request, createUserSchema);
  return ok(await createUser(ctx, input), { status: 201 });
});

export const PUT = methodNotAllowed("GET", "POST");
export const PATCH = methodNotAllowed("GET", "POST");
export const DELETE = methodNotAllowed("GET", "POST");
