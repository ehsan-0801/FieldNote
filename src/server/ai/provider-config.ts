import "server-only";
import type { AiProviderKind, AiSource } from "@/domain/ai-providers";
import { chatProviderFrom, selectChatProvider, type ChatProvider } from "../assistant/chat-provider";
import { db } from "../db";
import { serverEnv } from "../env";
import { KeyDecryptionError, decryptApiKey, deriveKeyEncryptionKey } from "./key-crypto";
import { createAnthropicCompleter } from "./anthropic";
import { GROQ_BASE_URL, createGeminiCompleter, createOpenAiCompatibleCompleter, extractionProviderFrom, type FetchLike } from "./providers";
import { selectProvider, type ProviderSelection } from "./run-extraction";
import type { JsonCompleter, ReportExtractionProvider } from "./types";

/** A decrypted provider configuration. Lives only for the duration of one request. */
export interface ProviderSettings {
  provider: AiProviderKind;
  model: string;
  apiKey: string;
  baseUrl: string | null;
}

/** Null when an OpenAI-compatible configuration has no base URL (the API never stores one like that). */
export function completerFor(settings: ProviderSettings, fetcher: FetchLike = fetch): JsonCompleter | null {
  switch (settings.provider) {
    case "gemini":
      return createGeminiCompleter(settings.apiKey, settings.model, fetcher);
    case "anthropic":
      return createAnthropicCompleter(settings.apiKey, settings.model, fetcher);
    case "groq":
    case "openai_compatible": {
      const baseUrl = settings.provider === "groq" ? GROQ_BASE_URL : settings.baseUrl;
      if (!baseUrl) return null;
      return createOpenAiCompatibleCompleter({ name: settings.provider, apiKey: settings.apiKey, model: settings.model, baseUrl }, fetcher);
    }
  }
}

export function extractionProviderFor(settings: ProviderSettings, fetcher: FetchLike = fetch): ReportExtractionProvider | null {
  const completer = completerFor(settings, fetcher);
  return completer ? extractionProviderFrom(completer) : null;
}

export function chatProviderFor(settings: ProviderSettings, fetcher: FetchLike = fetch): ChatProvider | null {
  const completer = completerFor(settings, fetcher);
  return completer ? chatProviderFrom(completer) : null;
}

const activeSelect = { id: true, label: true, provider: true, model: true, baseUrl: true, encryptedApiKey: true } as const;

export interface StoredConfig {
  id: string;
  provider: AiProviderKind;
  model: string;
  baseUrl: string | null;
  encryptedApiKey: string;
}

/** Null when the stored key can't be decrypted, e.g. after the encryption secret changed. */
export function decryptConfig(row: StoredConfig, workspaceId: string): ProviderSettings | null {
  try {
    const apiKey = decryptApiKey(row.encryptedApiKey, deriveKeyEncryptionKey(serverEnv()), workspaceId);
    return { provider: row.provider, model: row.model, apiKey, baseUrl: row.baseUrl };
  } catch (error) {
    if (!(error instanceof KeyDecryptionError)) throw error;
    console.error(`AI provider config ${row.id}: stored key could not be decrypted`);
    return null;
  }
}

async function activeConfig(workspaceId: string) {
  // updatedAt keeps the choice deterministic even if two rows were ever left active.
  return db.aiProviderConfig.findFirst({ where: { workspaceId, isActive: true }, select: activeSelect, orderBy: { updatedAt: "desc" } });
}

/**
 * Provider for report drafting. AI_PROVIDER=none turns AI off everywhere; otherwise the
 * workspace's active configuration wins, and without one the environment decides.
 * An active configuration whose key can't be read does not fall back to the environment,
 * so reports never go to a provider the administrator didn't choose.
 */
export async function resolveExtractionSelection(workspaceId: string): Promise<ProviderSelection> {
  const env = serverEnv();
  if (env.AI_PROVIDER === "none") return { provider: null, reason: "DISABLED" };
  const row = await activeConfig(workspaceId);
  if (!row) return selectProvider(env);
  const settings = decryptConfig(row, workspaceId);
  const provider = settings ? extractionProviderFor(settings) : null;
  return provider ? { provider } : { provider: null, reason: "NO_KEY" };
}

/**
 * Same rules as resolveExtractionSelection. Null means the assistant is unavailable.
 * With `configId`, that saved provider of the workspace is used instead of the default;
 * one that doesn't exist (in this workspace) or can't be decrypted gives null.
 */
export async function resolveChatProvider(workspaceId: string, configId?: string): Promise<ChatProvider | null> {
  const env = serverEnv();
  if (env.AI_PROVIDER === "none") return null;
  if (configId) {
    const chosen = await db.aiProviderConfig.findFirst({ where: { id: configId, workspaceId }, select: activeSelect });
    const settings = chosen ? decryptConfig(chosen, workspaceId) : null;
    return settings ? chatProviderFor(settings) : null;
  }
  const row = await activeConfig(workspaceId);
  if (!row) return selectChatProvider(env);
  const settings = decryptConfig(row, workspaceId);
  return settings ? chatProviderFor(settings) : null;
}

/** What drafting and the assistant would use right now, for the admin page. Never includes a key. */
export async function describeAiSource(workspaceId: string): Promise<AiSource> {
  const env = serverEnv();
  if (env.AI_PROVIDER === "none") return { kind: "disabled" };
  const row = await activeConfig(workspaceId);
  if (row) {
    const settings = decryptConfig(row, workspaceId);
    return {
      kind: "workspace",
      configId: row.id,
      label: row.label,
      provider: row.provider,
      model: row.model,
      usable: Boolean(settings && chatProviderFor(settings)),
    };
  }
  return env.AI_PROVIDER === "gemini"
    ? { kind: "environment", provider: "gemini", model: env.GEMINI_MODEL, hasKey: Boolean(env.GEMINI_API_KEY) }
    : { kind: "environment", provider: "groq", model: env.GROQ_MODEL, hasKey: Boolean(env.GROQ_API_KEY) };
}

export interface ChatProviderChoice {
  id: string;
  label: string;
  model: string;
  isActive: boolean;
}

/** Saved providers anyone in the workspace may pick for the assistant. Labels and models only; never keys. */
export async function listChatProviderChoices(workspaceId: string): Promise<ChatProviderChoice[]> {
  if (serverEnv().AI_PROVIDER === "none") return [];
  const rows = await db.aiProviderConfig.findMany({
    where: { workspaceId },
    select: { ...activeSelect, isActive: true },
    orderBy: [{ isActive: "desc" }, { label: "asc" }],
    take: 50,
  });
  return rows
    .filter((row) => decryptConfig(row, workspaceId) !== null)
    .map((row) => ({ id: row.id, label: row.label, model: row.model, isActive: row.isActive }));
}
