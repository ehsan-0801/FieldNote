import { noteSchema } from "@/domain/schemas";
import { authedRoute, ok, readJson } from "@/server/http";
import { addWorkOrderNote } from "@/server/work-orders/commands";

export const POST = authedRoute<{ id: string }>(async (request, ctx, { id }) => {
  const input = await readJson(request, noteSchema);
  return ok(await addWorkOrderNote(ctx, id, input), { status: 201 });
});
