import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { ServerEnv } from "../env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

// Distinct HKDF labels: the same secret never yields the same key for two purposes,
// and a key derived from SESSION_SECRET can't equal one derived from AI_KEYS_SECRET.
const INFO_DEDICATED = "fieldnote-atlas/ai-provider-keys/v1";
const INFO_SESSION_FALLBACK = "fieldnote-atlas/ai-provider-keys/from-session-secret/v1";

export class KeyDecryptionError extends Error {
  constructor() {
    super("stored API key could not be decrypted");
    this.name = "KeyDecryptionError";
  }
}

/**
 * The 32-byte key that protects stored provider API keys. AI_KEYS_SECRET is preferred.
 * Without it the key is derived from SESSION_SECRET, so rotating SESSION_SECRET makes
 * every stored provider key unreadable until an administrator enters it again.
 */
export function deriveKeyEncryptionKey(env: Pick<ServerEnv, "AI_KEYS_SECRET" | "SESSION_SECRET">): Buffer {
  const [secret, info] = env.AI_KEYS_SECRET ? [env.AI_KEYS_SECRET, INFO_DEDICATED] : [env.SESSION_SECRET, INFO_SESSION_FALLBACK];
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), info, 32));
}

/**
 * Encrypts an API key. `context` is bound as additional authenticated data (the
 * workspace ID), so a ciphertext copied into another workspace's row fails to decrypt.
 */
export function encryptApiKey(plaintext: string, key: Buffer, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

/** Throws KeyDecryptionError for a wrong key, a wrong context or any modified byte. */
export function decryptApiKey(payload: string, key: Buffer, context: string): string {
  const [version, encoded, extra] = payload.split(":");
  if (version !== VERSION || !encoded || extra !== undefined) throw new KeyDecryptionError();
  const raw = Buffer.from(encoded, "base64url");
  if (raw.length <= IV_BYTES + TAG_BYTES) throw new KeyDecryptionError();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, raw.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    throw new KeyDecryptionError();
  }
}

/** The only part of a key that is ever displayed. */
export function lastFour(apiKey: string): string {
  return apiKey.slice(-4);
}
