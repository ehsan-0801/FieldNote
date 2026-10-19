import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { Actor } from "@/domain/access";
import { serverEnv } from "./env";

/** Who is acting and how to correlate the request in logs and audit rows. */
export interface ActorContext {
  actor: Actor;
  requestId: string;
  ipHash: string | null;
}

export function newRequestId(): string {
  return randomUUID();
}

/** Client IPs are only stored as a keyed hash; enough to spot abuse, useless if leaked. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac("sha256", serverEnv().SESSION_SECRET).update(ip).digest("hex").slice(0, 32);
}

/**
 * Client IP for rate limiting. Prefers headers set by the platform (Vercel) over
 * X-Forwarded-For, and from X-Forwarded-For takes the right-most entry, which is
 * the one added by the nearest proxy rather than one a client can prepend.
 */
export function clientIp(headers: Headers): string | null {
  const platform = headers.get("x-vercel-forwarded-for") ?? headers.get("x-real-ip");
  if (platform) return platform.split(",")[0]?.trim() || null;
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",").at(-1)?.trim() || null;
}
