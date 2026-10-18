import { authedRoute, ok } from "@/server/http";
import { getDashboardSummary } from "@/server/work-orders/queries";

export const GET = authedRoute(async (_request, ctx) => ok(await getDashboardSummary(ctx.actor)));
