import { parseReportSchema } from "@/domain/schemas";
import { draftWorkOrderFromReport } from "@/server/ai/service";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const POST = authedRoute(async (request, ctx) => {
  const { workOrderId } = await readJson(request, parseReportSchema);
  return ok(await draftWorkOrderFromReport(ctx, workOrderId));
});

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
