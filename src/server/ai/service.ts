import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { AiRunStatus } from "@/generated/prisma/enums";
import { DomainError } from "@/domain/errors";
import { EXTRACTION_SCHEMA_VERSION } from "@/domain/extraction";
import { editPermissions } from "@/domain/access";
import { recordAudit } from "../audit";
import { db } from "../db";
import { serverEnv } from "../env";
import { enforceRateLimit } from "../rate-limit";
import type { ActorContext } from "../request-context";
import { loadVisibleWorkOrder } from "../work-orders/scope";
import { parseStoredExtraction } from "../work-orders/queries";
import { redactContactDetails } from "./redact";
import { runExtraction, selectProvider } from "./run-extraction";

/**
 * Drafts structure for a saved report. The report is read from the database, not
 * the request, and the model only ever sees redacted text plus category names.
 * The result is stored as a suggestion; no work-order field changes here.
 */
export async function draftWorkOrderFromReport(ctx: ActorContext, workOrderId: string) {
  const { facts } = await loadVisibleWorkOrder(db, ctx.actor, workOrderId);
  if (!editPermissions(ctx.actor, facts).fields.includes("title")) {
    throw new DomainError("FORBIDDEN", "Only the reporter or a coordinator can draft this report’s structure.");
  }
  await enforceRateLimit("aiParse", ctx.actor.id);

  const [workOrder, categories] = await Promise.all([
    db.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { originalReport: true, locationLabel: true, assetLabel: true },
    }),
    db.category.findMany({
      where: { workspaceId: ctx.actor.workspaceId, isActive: true },
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const env = serverEnv();
  const run = await runExtraction(
    {
      report: redactContactDetails(workOrder.originalReport),
      locationLabel: workOrder.locationLabel ? redactContactDetails(workOrder.locationLabel) : null,
      assetLabel: workOrder.assetLabel ? redactContactDetails(workOrder.assetLabel) : null,
      categories,
    },
    selectProvider(env),
    { timeoutMs: env.AI_TIMEOUT_MS },
  );

  const { suggestion } = run;
  const suggestedFields: Prisma.InputJsonObject = {
    categorySlug: suggestion.categorySlug,
    suggestedPriority: suggestion.suggestedPriority,
    suggestedNextStep: suggestion.suggestedNextStep,
  };
  const signals: Prisma.InputJsonArray = suggestion.signals.map((signal) => ({ factor: signal.factor, evidence: signal.evidence }));

  const row = await db.$transaction(async (tx) => {
    const created = await tx.aiExtraction.create({
      data: {
        workOrderId,
        provider: run.provider,
        model: run.model,
        status: run.status === "SUCCEEDED" ? AiRunStatus.SUCCEEDED : AiRunStatus.FALLBACK,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        suggestedTitle: suggestion.suggestedTitle,
        summary: suggestion.summary,
        suggestedFields,
        evidenceSignals: signals,
        missingDetails: suggestion.missingDetails,
        confidence: suggestion.confidence,
        latencyMs: run.latencyMs,
        errorCode: run.errorCode,
      },
    });
    await recordAudit(tx, {
      workspaceId: ctx.actor.workspaceId,
      actorId: ctx.actor.id,
      action: "work_order.ai_extraction",
      entityType: "WorkOrder",
      entityId: workOrderId,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      details: { provider: run.provider, model: run.model, status: created.status, errorCode: run.errorCode, latencyMs: run.latencyMs },
    });
    return created;
  });

  const stored = parseStoredExtraction(row);
  if (!stored) throw new DomainError("INTERNAL_ERROR", "The draft couldn’t be read back. Continue manually.");
  return stored;
}
