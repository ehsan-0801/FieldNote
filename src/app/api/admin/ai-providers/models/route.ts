import { listAiModelsSchema } from "@/domain/ai-providers";
import { listAiModels } from "@/server/admin/ai-providers";
import { authedRoute, ok, readJson } from "@/server/http";
import { methodNotAllowed } from "@/server/method-not-allowed";

// One model-list call, bounded by the test timeout.
export const maxDuration = 30;

// POST, not GET: the request carries an API key, which must never sit in a URL or a log.
export const POST = authedRoute(async (request, ctx) => ok(await listAiModels(ctx, await readJson(request, listAiModelsSchema))));

export const GET = methodNotAllowed("POST");
export const PUT = methodNotAllowed("POST");
export const PATCH = methodNotAllowed("POST");
export const DELETE = methodNotAllowed("POST");
