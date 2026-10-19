import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { canManageWorkspace, type Actor } from "@/domain/access";
import {
  AI_TEST_MESSAGE,
  AI_TEST_TIMEOUT_MS,
  BASE_URL_REQUIRED,
  aiService,
  isLoopbackUrl,
  serviceForConfig,
  type AiProviderKind,
  type AiServiceId,
  type AiTestCode,
  type createAiProviderSchema,
  type listAiModelsSchema,
  type updateAiProviderSchema,
} from "@/domain/ai-providers";
import { DomainError, type FieldErrors } from "@/domain/errors";
import { chooseModel, listModels } from "../ai/models";
import { chatProviderFor, decryptConfig, describeAiSource, type ProviderSettings } from "../ai/provider-config";
import { deriveKeyEncryptionKey, encryptApiKey, lastFour } from "../ai/key-crypto";
import { ProviderFailure } from "../ai/types";
import { recordAudit } from "../audit";
import { db, type Tx } from "../db";
import { isProduction, serverEnv } from "../env";
import { enforceRateLimit } from "../rate-limit";
import type { ActorContext } from "../request-context";

const MAX_CONFIGS = 50;
const NOT_FOUND = "That AI provider isn’t in this workspace.";
const DUPLICATE_LABEL = "Another AI provider already uses this label.";

function assertAdmin(actor: Actor) {
  if (!canManageWorkspace(actor)) throw new DomainError("FORBIDDEN", "Only administrators can manage AI providers.");
}

// encryptedApiKey is selected only to check it can still be decrypted; toPublic drops it.
const configSelect = {
  id: true,
  label: true,
  provider: true,
  model: true,
  keyLast4: true,
  baseUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  encryptedApiKey: true,
  createdBy: { select: { name: true } },
} as const;

type ConfigRow = Prisma.AiProviderConfigGetPayload<{ select: typeof configSelect }>;

/** The shape every API response uses. There is no field that could carry the key. */
export interface PublicAiProvider {
  id: string;
  label: string;
  provider: AiProviderKind;
  service: AiServiceId;
  model: string;
  keyLast4: string;
  baseUrl: string | null;
  isActive: boolean;
  keyReadable: boolean;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPublic(row: ConfigRow, workspaceId: string): PublicAiProvider {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    service: serviceForConfig(row.provider, row.baseUrl).id as AiServiceId,
    model: row.model,
    keyLast4: row.keyLast4,
    baseUrl: row.baseUrl,
    isActive: row.isActive,
    keyReadable: decryptConfig(row, workspaceId) !== null,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function encrypt(apiKey: string, workspaceId: string) {
  return { encryptedApiKey: encryptApiKey(apiKey, deriveKeyEncryptionKey(serverEnv()), workspaceId), keyLast4: lastFour(apiKey) };
}

/** The stored kind and base URL for a service: presets carry their own URL, "custom" needs the admin's. */
function resolveService(serviceId: AiServiceId, baseUrl: string | null | undefined): { provider: AiProviderKind; baseUrl: string | null } {
  const service = aiService(serviceId);
  if (service.kind !== "openai_compatible") return { provider: service.kind, baseUrl: null };
  if (service.baseUrl) return { provider: service.kind, baseUrl: service.baseUrl };
  if (!baseUrl) throw new DomainError("VALIDATION_ERROR", "Some fields need attention.", { baseUrl: [BASE_URL_REQUIRED] });
  // A deployed server calling its own loopback interface is never what an administrator means.
  if (isProduction() && isLoopbackUrl(baseUrl)) {
    throw new DomainError("VALIDATION_ERROR", "Some fields need attention.", {
      baseUrl: ["Local addresses only work in development. Use the provider’s public https:// address."],
    });
  }
  return { provider: service.kind, baseUrl };
}

function rethrowDuplicate(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new DomainError("CONFLICT", DUPLICATE_LABEL, { label: [DUPLICATE_LABEL] });
  }
  throw error;
}

async function findInWorkspace(tx: Tx, actor: Actor, id: string) {
  const row = await tx.aiProviderConfig.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: configSelect });
  if (!row) throw new DomainError("NOT_FOUND", NOT_FOUND);
  return row;
}

/**
 * Serialises activation changes per workspace: the row lock on the workspace is held
 * until the transaction commits, so two concurrent activations can't both leave a row active.
 */
async function lockWorkspace(tx: Tx, workspaceId: string) {
  await tx.workspace.update({ where: { id: workspaceId }, data: { updatedAt: new Date() }, select: { id: true } });
}

export async function listAiProviders(actor: Actor) {
  assertAdmin(actor);
  const [rows, source] = await Promise.all([
    db.aiProviderConfig.findMany({
      where: { workspaceId: actor.workspaceId },
      select: configSelect,
      orderBy: [{ isActive: "desc" }, { label: "asc" }],
      take: MAX_CONFIGS,
    }),
    describeAiSource(actor.workspaceId),
  ]);
  return { providers: rows.map((row) => toPublic(row, actor.workspaceId)), source };
}

export async function createAiProvider(ctx: ActorContext, input: z.infer<typeof createAiProviderSchema>) {
  assertAdmin(ctx.actor);
  const { workspaceId } = ctx.actor;
  const service = aiService(input.service);
  const resolved = resolveService(input.service, input.baseUrl);
  const { model, checked } = await connect(ctx, { ...resolved, apiKey: input.apiKey }, input.model, service.preferredModels);
  const label = input.label ?? `${service.name} key ending ${lastFour(input.apiKey)}`;
  const activate = input.activate && checked;
  try {
    return await db.$transaction(async (tx) => {
      if (activate) await lockWorkspace(tx, workspaceId);
      if ((await tx.aiProviderConfig.count({ where: { workspaceId } })) >= MAX_CONFIGS) {
        throw new DomainError("CONFLICT", `A workspace can keep up to ${MAX_CONFIGS} AI providers. Delete one you no longer use.`);
      }
      const previous = activate
        ? await tx.aiProviderConfig.findMany({ where: { workspaceId, isActive: true }, select: { id: true, label: true } })
        : [];
      if (previous.length > 0) await tx.aiProviderConfig.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } });
      const row = await tx.aiProviderConfig.create({
        data: {
          workspaceId,
          label,
          provider: resolved.provider,
          model,
          baseUrl: resolved.baseUrl,
          isActive: activate,
          ...encrypt(input.apiKey, workspaceId),
          createdById: ctx.actor.id,
        },
        select: configSelect,
      });
      const audit = {
        workspaceId,
        actorId: ctx.actor.id,
        entityType: "AiProviderConfig" as const,
        entityId: row.id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
      };
      await recordAudit(tx, {
        ...audit,
        action: "ai_provider.created",
        details: { label: row.label, provider: row.provider, model: row.model, baseUrl: row.baseUrl, connectionChecked: checked },
      });
      if (activate) {
        await recordAudit(tx, {
          ...audit,
          action: "ai_provider.activated",
          details: { label: row.label, model: row.model, replaced: previous.map((item) => item.label) },
        });
      }
      return toPublic(row, workspaceId);
    });
  } catch (error) {
    rethrowDuplicate(error);
  }
}

export async function updateAiProvider(ctx: ActorContext, id: string, input: z.infer<typeof updateAiProviderSchema>) {
  assertAdmin(ctx.actor);
  const { workspaceId } = ctx.actor;
  try {
    return await db.$transaction(async (tx) => {
      const current = await findInWorkspace(tx, ctx.actor, id);
      const serviceId = input.service ?? (serviceForConfig(current.provider, current.baseUrl).id as AiServiceId);
      const { provider, baseUrl } = resolveService(serviceId, input.baseUrl === undefined ? current.baseUrl : input.baseUrl);
      if (provider !== current.provider && !input.apiKey) {
        throw new DomainError("VALIDATION_ERROR", "Some fields need attention.", {
          apiKey: ["Enter the key for the new provider. The current key belongs to a different service."],
        });
      }
      const row = await tx.aiProviderConfig.update({
        where: { id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.model !== undefined ? { model: input.model } : {}),
          provider,
          baseUrl,
          ...(input.apiKey ? encrypt(input.apiKey, workspaceId) : {}),
        },
        select: configSelect,
      });
      const changed = (["label", "provider", "model", "baseUrl"] as const).filter((field) => row[field] !== current[field]);
      await recordAudit(tx, {
        workspaceId,
        actorId: ctx.actor.id,
        action: "ai_provider.updated",
        entityType: "AiProviderConfig",
        entityId: id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        details: { label: row.label, model: row.model, changed, keyReplaced: Boolean(input.apiKey) },
      });
      return toPublic(row, workspaceId);
    });
  } catch (error) {
    rethrowDuplicate(error);
  }
}

/** Deleting the active configuration hands AI back to the environment default. */
export async function deleteAiProvider(ctx: ActorContext, id: string) {
  assertAdmin(ctx.actor);
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, ctx.actor.workspaceId);
    const current = await findInWorkspace(tx, ctx.actor, id);
    await tx.aiProviderConfig.delete({ where: { id } });
    await recordAudit(tx, {
      workspaceId: ctx.actor.workspaceId,
      actorId: ctx.actor.id,
      action: "ai_provider.deleted",
      entityType: "AiProviderConfig",
      entityId: id,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      details: { label: current.label, model: current.model, wasActive: current.isActive },
    });
    return { id, wasActive: current.isActive };
  });
}

export async function activateAiProvider(ctx: ActorContext, id: string) {
  assertAdmin(ctx.actor);
  const { workspaceId } = ctx.actor;
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const current = await findInWorkspace(tx, ctx.actor, id);
    if (!decryptConfig(current, workspaceId)) {
      throw new DomainError("CONFLICT", "This provider’s key can’t be decrypted. Edit it and enter the key again before switching to it.");
    }
    const previous = await tx.aiProviderConfig.findMany({
      where: { workspaceId, isActive: true, id: { not: id } },
      select: { id: true, label: true },
    });
    await tx.aiProviderConfig.updateMany({ where: { workspaceId, isActive: true, id: { not: id } }, data: { isActive: false } });
    const row = current.isActive
      ? current
      : await tx.aiProviderConfig.update({ where: { id }, data: { isActive: true }, select: configSelect });
    if (!current.isActive || previous.length > 0) {
      await recordAudit(tx, {
        workspaceId,
        actorId: ctx.actor.id,
        action: "ai_provider.activated",
        entityType: "AiProviderConfig",
        entityId: id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        details: { label: row.label, model: row.model, replaced: previous.map((item) => item.label) },
      });
    }
    return toPublic(row, workspaceId);
  });
}

/** Leaves every configuration inactive, so the environment settings apply again. */
export async function switchToEnvironmentDefault(ctx: ActorContext) {
  assertAdmin(ctx.actor);
  const { workspaceId } = ctx.actor;
  return db.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const active = await tx.aiProviderConfig.findMany({ where: { workspaceId, isActive: true }, select: { id: true, label: true } });
    if (active.length === 0) return { deactivated: 0 };
    await tx.aiProviderConfig.updateMany({ where: { workspaceId, isActive: true }, data: { isActive: false } });
    for (const item of active) {
      await recordAudit(tx, {
        workspaceId,
        actorId: ctx.actor.id,
        action: "ai_provider.deactivated",
        entityType: "AiProviderConfig",
        entityId: item.id,
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        details: { label: item.label },
      });
    }
    return { deactivated: active.length };
  });
}

function testCodeFor(error: unknown): AiTestCode {
  if (!(error instanceof ProviderFailure)) return "PROVIDER_ERROR";
  if (error.code === "RATE_LIMITED") return "RATE_LIMITED";
  if (error.code === "TIMEOUT") return "TIMEOUT";
  if (error.httpStatus === 401 || error.httpStatus === 403) return "KEY_REJECTED";
  if (error.httpStatus === 404) return "MODEL_OR_URL_NOT_FOUND";
  if (error.httpStatus === null && error.retryable) return "UNREACHABLE";
  return "PROVIDER_ERROR";
}

const TEST_SYSTEM = 'This is a connection check. Answer with step "answer", tool "none", reply "ok" and every other text field empty.';

/** Sends one tiny prompt through the same adapter drafting and the assistant use. */
async function checkConnection(settings: ProviderSettings): Promise<AiTestCode> {
  const chat = chatProviderFor(settings);
  if (!chat) return "KEY_UNREADABLE";
  try {
    const text = await chat.complete(TEST_SYSTEM, [{ role: "user", text: "Connection check." }], AbortSignal.timeout(AI_TEST_TIMEOUT_MS));
    return text.trim() ? "OK" : "EMPTY_RESPONSE";
  } catch (error) {
    return testCodeFor(error);
  }
}

type Connection = Omit<ProviderSettings, "model">;

/** The provider's chat models, with the one to use when the admin doesn't name one. */
async function discoverModels(connection: Connection, preferred: readonly string[]) {
  try {
    const models = await listModels(
      { kind: connection.provider, apiKey: connection.apiKey, baseUrl: connection.baseUrl },
      AbortSignal.timeout(AI_TEST_TIMEOUT_MS),
    );
    if (models.length === 0) return { ok: false as const, code: "NO_MODELS" as AiTestCode };
    return { ok: true as const, models, suggested: chooseModel(models, preferred) ?? models[0] };
  } catch (error) {
    return { ok: false as const, code: testCodeFor(error) };
  }
}

function connectionFailure(code: AiTestCode, modelGiven: boolean): DomainError {
  const message = AI_TEST_MESSAGE[code];
  const fieldErrors: FieldErrors | undefined =
    code === "KEY_REJECTED"
      ? { apiKey: [message] }
      : code === "NO_MODELS" || (code === "MODEL_OR_URL_NOT_FOUND" && modelGiven)
        ? { model: [message] }
        : undefined;
  return new DomainError("VALIDATION_ERROR", message, fieldErrors);
}

/**
 * Picks the model (from the provider's own list when none is given) and checks the key
 * answers a prompt. Throws a field error the form can show when it doesn't. With AI turned
 * off for the deployment nothing is sent, and the configuration is saved unchecked.
 */
async function connect(ctx: ActorContext, connection: Connection, model: string | undefined, preferred: readonly string[]) {
  if (serverEnv().AI_PROVIDER === "none") {
    const fallback = model ?? preferred[0];
    if (!fallback) {
      throw new DomainError("VALIDATION_ERROR", "Some fields need attention.", {
        model: ["AI is turned off for this deployment, so models can’t be looked up. Enter the model name."],
      });
    }
    return { model: fallback, checked: false };
  }
  await enforceRateLimit("aiProviderTest", ctx.actor.id);
  let chosen = model;
  if (!chosen) {
    const discovered = await discoverModels(connection, preferred);
    // Some compatible servers have no model list; a preferred model may still answer.
    if (!discovered.ok && !(discovered.code === "MODEL_OR_URL_NOT_FOUND" && preferred[0])) throw connectionFailure(discovered.code, false);
    chosen = discovered.ok ? discovered.suggested : preferred[0];
  }
  const code = await checkConnection({ ...connection, model: chosen });
  if (code !== "OK") throw connectionFailure(code, Boolean(model));
  return { model: chosen, checked: true };
}

/** Model choices for the add and edit forms. A saved provider's key is used when no new key is given. */
export async function listAiModels(ctx: ActorContext, input: z.infer<typeof listAiModelsSchema>) {
  assertAdmin(ctx.actor);
  if (serverEnv().AI_PROVIDER === "none") {
    throw new DomainError("AI_UNAVAILABLE", "AI is turned off for this deployment (AI_PROVIDER=none), so nothing was sent.");
  }
  let connection: Connection;
  let preferred: readonly string[];
  if ("configId" in input) {
    const row = await findInWorkspace(db, ctx.actor, input.configId);
    const service = serviceForConfig(row.provider, row.baseUrl);
    preferred = service.preferredModels;
    if (input.apiKey) {
      connection = { provider: row.provider, baseUrl: row.baseUrl, apiKey: input.apiKey };
    } else {
      const settings = decryptConfig(row, ctx.actor.workspaceId);
      if (!settings) throw new DomainError("CONFLICT", AI_TEST_MESSAGE.KEY_UNREADABLE);
      connection = settings;
    }
  } else {
    connection = { ...resolveService(input.service, input.baseUrl), apiKey: input.apiKey };
    preferred = aiService(input.service).preferredModels;
  }
  await enforceRateLimit("aiProviderTest", ctx.actor.id);
  const discovered = await discoverModels(connection, preferred);
  if (!discovered.ok) throw connectionFailure(discovered.code, false);
  return { models: discovered.models, suggested: discovered.suggested };
}

/**
 * Sends one tiny prompt through the same adapter drafting and the assistant use. The
 * result is one of our own codes and messages; the provider's response is discarded.
 */
export async function testAiProvider(ctx: ActorContext, id: string) {
  assertAdmin(ctx.actor);
  if (serverEnv().AI_PROVIDER === "none") {
    throw new DomainError("AI_UNAVAILABLE", "AI is turned off for this deployment (AI_PROVIDER=none), so nothing was sent.");
  }
  await enforceRateLimit("aiProviderTest", ctx.actor.id);
  const row = await findInWorkspace(db, ctx.actor, id);

  const startedAt = Date.now();
  const settings = decryptConfig(row, ctx.actor.workspaceId);
  const code: AiTestCode = settings ? await checkConnection(settings) : "KEY_UNREADABLE";
  const latencyMs = Date.now() - startedAt;

  await db.$transaction((tx) =>
    recordAudit(tx, {
      workspaceId: ctx.actor.workspaceId,
      actorId: ctx.actor.id,
      action: "ai_provider.tested",
      entityType: "AiProviderConfig",
      entityId: id,
      requestId: ctx.requestId,
      ipHash: ctx.ipHash,
      details: { label: row.label, model: row.model, result: code, latencyMs },
    }),
  );
  return { ok: code === "OK", code, message: AI_TEST_MESSAGE[code], latencyMs };
}
