import { z } from "zod";

/** The API shape the server speaks. Every OpenAI-style service shares one adapter. */
export const AI_PROVIDER_KINDS = ["gemini", "groq", "anthropic", "openai_compatible"] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export const AI_PROVIDER_LABEL: Record<AiProviderKind, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  anthropic: "Anthropic Claude",
  openai_compatible: "OpenAI-compatible",
};

export interface AiService {
  id: string;
  name: string;
  kind: AiProviderKind;
  /** Fixed API base URL for OpenAI-compatible services; null when the kind has its own endpoint or the admin enters one. */
  baseUrl: string | null;
  /** Key prefixes this service issues, most specific first. */
  keyPrefixes: readonly string[];
  /** Tried in order against the provider's model list when no model is entered. */
  preferredModels: readonly string[];
}

/**
 * Services an administrator can pick, or that a pasted key is matched to. Model names
 * here are only preferences: the server reads the provider's own model list and falls
 * back to the first usable model when none of these is offered.
 */
export const AI_SERVICES = [
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "gemini",
    baseUrl: null,
    keyPrefixes: ["AIza"],
    preferredModels: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: null,
    keyPrefixes: ["sk-ant-"],
    preferredModels: ["claude-opus-5-5"],
  },
  {
    id: "groq",
    name: "Groq",
    kind: "groq",
    baseUrl: null,
    keyPrefixes: ["gsk_"],
    preferredModels: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    keyPrefixes: ["sk-proj-", "sk-svcacct-", "sk-"],
    preferredModels: ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai_compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    keyPrefixes: ["sk-or-"],
    preferredModels: ["openrouter/auto"],
  },
  {
    id: "xai",
    name: "xAI Grok",
    kind: "openai_compatible",
    baseUrl: "https://api.x.ai/v1",
    keyPrefixes: ["xai-"],
    preferredModels: ["grok-4-fast", "grok-3-mini"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai_compatible",
    baseUrl: "https://api.deepseek.com/v1",
    keyPrefixes: [],
    preferredModels: ["deepseek-chat"],
  },
  {
    id: "mistral",
    name: "Mistral",
    kind: "openai_compatible",
    baseUrl: "https://api.mistral.ai/v1",
    keyPrefixes: [],
    preferredModels: ["mistral-small-latest", "mistral-medium-latest"],
  },
  {
    id: "together",
    name: "Together AI",
    kind: "openai_compatible",
    baseUrl: "https://api.together.xyz/v1",
    keyPrefixes: ["tgp_"],
    preferredModels: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    kind: "openai_compatible",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyPrefixes: ["fw_"],
    preferredModels: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    kind: "openai_compatible",
    baseUrl: "https://api.cerebras.ai/v1",
    keyPrefixes: ["csk-"],
    preferredModels: ["gpt-oss-120b", "llama-3.3-70b"],
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    kind: "openai_compatible",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyPrefixes: ["nvapi-"],
    preferredModels: ["meta/llama-3.3-70b-instruct"],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    kind: "openai_compatible",
    baseUrl: "https://router.huggingface.co/v1",
    keyPrefixes: ["hf_"],
    preferredModels: ["meta-llama/Llama-3.3-70B-Instruct"],
  },
  {
    id: "custom",
    name: "Other (OpenAI-compatible)",
    kind: "openai_compatible",
    baseUrl: null,
    keyPrefixes: [],
    preferredModels: [],
  },
] as const satisfies readonly AiService[];

export type AiServiceId = (typeof AI_SERVICES)[number]["id"];
export const AI_SERVICE_IDS = AI_SERVICES.map((service) => service.id) as [AiServiceId, ...AiServiceId[]];

export function aiService(id: AiServiceId): AiService {
  return AI_SERVICES.find((service) => service.id === id) ?? AI_SERVICES[AI_SERVICES.length - 1];
}

/** The preset a stored configuration belongs to: by kind, then by base URL; anything else is "custom". */
export function serviceForConfig(kind: AiProviderKind, baseUrl: string | null): AiService {
  if (kind !== "openai_compatible") return AI_SERVICES.find((service) => service.kind === kind) ?? aiService("custom");
  const normalized = baseUrl?.replace(/\/+$/, "");
  return AI_SERVICES.find((service) => service.baseUrl !== null && service.baseUrl === normalized) ?? aiService("custom");
}

export interface KeyDetection {
  service: AiService;
  /** True when other services issue keys in the same format (plain "sk-" keys). */
  ambiguous: boolean;
}

/** Matches a key to the service that issues it by its prefix. Null when the format isn't recognised. */
export function detectServiceFromKey(rawKey: string): KeyDetection | null {
  const key = rawKey.trim();
  let best: { service: AiService; prefix: string } | null = null;
  for (const service of AI_SERVICES) {
    for (const prefix of service.keyPrefixes) {
      if (key.startsWith(prefix) && key.length > prefix.length && (!best || prefix.length > best.prefix.length)) {
        best = { service, prefix };
      }
    }
  }
  if (!best) return null;
  return { service: best.service, ambiguous: best.prefix === "sk-" };
}

/** Where drafting and the assistant get their model from right now. Never carries a key. */
export type AiSource =
  | { kind: "disabled" }
  | { kind: "workspace"; configId: string; label: string; provider: AiProviderKind; model: string; usable: boolean }
  | { kind: "environment"; provider: "gemini" | "groq"; model: string; hasKey: boolean };

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for a base URL the server may call: HTTPS, or HTTP to this machine (local Ollama). No credentials, query or fragment. */
export function isAcceptableBaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
}

export function isLoopbackUrl(value: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

const label = z.string().trim().min(2, { error: "Use at least 2 characters." }).max(60);
const model = z
  .string()
  .trim()
  .min(1, { error: "Enter the model name." })
  .max(120)
  .regex(/^[\w.:/@-]+$/, { error: "Use the model name exactly as the provider lists it, without spaces." });
const apiKey = z
  .string()
  .trim()
  .min(8, { error: "That doesn’t look like a complete key." })
  .max(512)
  .regex(/^\S+$/, { error: "Keys don’t contain spaces." });
const baseUrl = z
  .string()
  .trim()
  .max(300)
  .refine(isAcceptableBaseUrl, { error: "Use an https:// address, or http://localhost for a local server." })
  .transform((value) => value.replace(/\/+$/, ""));

export const BASE_URL_REQUIRED = "Enter the API base URL, for example https://openrouter.ai/api/v1.";

const service = z.enum(AI_SERVICE_IDS, { error: "Choose which service the key is for." });
const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

function requireBaseUrlForCustom(value: { service?: AiServiceId; baseUrl?: string | null }, context: z.RefinementCtx) {
  if (value.service === "custom" && !value.baseUrl) {
    context.addIssue({ code: "custom", path: ["baseUrl"], message: BASE_URL_REQUIRED });
  }
}

/**
 * Only the key is needed: the service is detected from it in the form, the model is
 * picked from the provider's own list when left blank, and the label defaults too.
 */
export const createAiProviderSchema = z
  .strictObject({
    apiKey,
    service,
    label: z.preprocess(blankToUndefined, label.optional()),
    model: z.preprocess(blankToUndefined, model.optional()),
    baseUrl: z.preprocess(blankToUndefined, baseUrl.optional()),
    /** Switch drafting and the assistant to this provider once the connection check passes. */
    activate: z.boolean().default(true),
  })
  .superRefine(requireBaseUrlForCustom);

/** Every field is optional. An omitted or empty apiKey keeps the stored key. */
export const updateAiProviderSchema = z
  .strictObject({
    label: label.optional(),
    service: service.optional(),
    model: model.optional(),
    apiKey: z.preprocess(blankToUndefined, apiKey.optional()),
    baseUrl: z.preprocess(blankToUndefined, baseUrl.nullable().optional()),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), { error: "Nothing to update." })
  .superRefine(requireBaseUrlForCustom);

/** Model lookup for the forms: a new key, or a saved provider (optionally with a replacement key). */
export const listAiModelsSchema = z.union([
  z.strictObject({ apiKey, service, baseUrl: z.preprocess(blankToUndefined, baseUrl.optional()) }).superRefine(requireBaseUrlForCustom),
  z.strictObject({ configId: z.string().min(1).max(64), apiKey: z.preprocess(blankToUndefined, apiKey.optional()) }),
]);

export const AI_TEST_TIMEOUT_MS = 15_000;

/** Outcome codes for a connection test. Never the provider's own message. */
export const AI_TEST_CODES = [
  "OK",
  "KEY_REJECTED",
  "MODEL_OR_URL_NOT_FOUND",
  "RATE_LIMITED",
  "TIMEOUT",
  "UNREACHABLE",
  "PROVIDER_ERROR",
  "EMPTY_RESPONSE",
  "KEY_UNREADABLE",
  "NO_MODELS",
] as const;
export type AiTestCode = (typeof AI_TEST_CODES)[number];

export const AI_TEST_MESSAGE: Record<AiTestCode, string> = {
  OK: "Connected. The provider answered the test prompt.",
  KEY_REJECTED: "The provider rejected the API key. Check it was copied in full and is still active.",
  MODEL_OR_URL_NOT_FOUND: "The provider couldn’t find that model or address. Check the model name and base URL.",
  RATE_LIMITED: "The provider is rate limiting this key. Wait a minute or check the plan’s quota.",
  TIMEOUT: `The provider didn’t answer within ${AI_TEST_TIMEOUT_MS / 1000} seconds.`,
  UNREACHABLE: "Couldn’t reach the provider. Check the base URL and that the service is running.",
  PROVIDER_ERROR: "The provider refused the request. Check the key has access to this model, or pick another model.",
  EMPTY_RESPONSE: "The provider answered, but with an empty reply. Try a different model.",
  NO_MODELS: "The key works, but the provider lists no chat models for it. Enter a model name.",
  KEY_UNREADABLE: "The stored key can’t be decrypted, probably because the encryption secret changed. Enter the key again.",
};
