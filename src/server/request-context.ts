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

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}
