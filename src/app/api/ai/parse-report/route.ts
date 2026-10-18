import { parseReportSchema } from "@/domain/schemas";
import { draftWorkOrderFromReport } from "@/server/ai/service";
import { authedRoute, ok, readJson } from "@/server/http";

export const POST = authedRoute(async (request, ctx) => {
  const { workOrderId } = await readJson(request, parseReportSchema);
  return ok(await draftWorkOrderFromReport(ctx, workOrderId));
});
