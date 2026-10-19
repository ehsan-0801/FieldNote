import { authedRoute, ok } from "@/server/http";
import { getDashboardSummary } from "@/server/work-orders/queries";
import { methodNotAllowed } from "@/server/method-not-allowed";

export const GET = authedRoute(async (_request, ctx) => ok(await getDashboardSummary(ctx.actor)));

export const POST = methodNotAllowed("GET");
export const PUT = methodNotAllowed("GET");
export const PATCH = methodNotAllowed("GET");
export const DELETE = methodNotAllowed("GET");
