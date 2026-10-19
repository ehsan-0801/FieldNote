import "server-only";
import { DomainError } from "@/domain/errors";
import { db } from "./db";

export const RATE_LIMITS = {
  // Per client IP: generous enough for a shared office network.
  loginIp: { limit: 20, windowSeconds: 15 * 60 },
  // Per account, failed attempts only: slows password guessing without letting
  // anyone lock a person out by signing in as them successfully elsewhere.
  loginEmail: { limit: 8, windowSeconds: 15 * 60 },
  aiParse: { limit: 12, windowSeconds: 10 * 60 },
  assistant: { limit: 30, windowSeconds: 10 * 60 },
  // Per administrator: each connection test spends quota on the provider's side.
  aiProviderTest: { limit: 20, windowSeconds: 10 * 60 },
  mutation: { limit: 120, windowSeconds: 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

const LIMITED = "Too many attempts. Wait a few minutes and try again.";

function windowStartAfter(name: RateLimitName, now: Date): Date {
  return new Date(now.getTime() - RATE_LIMITS[name].windowSeconds * 1000);
}

/** Throws if the window is already full, without counting this request. */
export async function assertUnderRateLimit(name: RateLimitName, subject: string): Promise<void> {
  const bucket = await db.rateLimitBucket.findUnique({ where: { key: `${name}:${subject}` }, select: { count: true, windowStart: true } });
  if (bucket && bucket.windowStart > windowStartAfter(name, new Date()) && bucket.count >= RATE_LIMITS[name].limit) {
    throw new DomainError("RATE_LIMITED", LIMITED);
  }
}

/**
 * Fixed-window counter stored in Postgres so it holds across serverless instances.
 * Two requests racing on an expired window can both reset it to 1; that slight
 * undercount is acceptable for abuse protection.
 */
export async function enforceRateLimit(name: RateLimitName, subject: string): Promise<void> {
  if ((await countAttempt(name, subject)) > RATE_LIMITS[name].limit) throw new DomainError("RATE_LIMITED", LIMITED);
}

/** Adds one attempt to the current window and returns the window's count. */
export async function countAttempt(name: RateLimitName, subject: string): Promise<number> {
  const key = `${name}:${subject}`;
  const now = new Date();
  const windowOpenedAfter = windowStartAfter(name, now);

  const bumped = await db.rateLimitBucket.updateMany({
    where: { key, windowStart: { gt: windowOpenedAfter } },
    data: { count: { increment: 1 } },
  });

  let count = 1;
  if (bumped.count === 0) {
    await db.rateLimitBucket.upsert({
      where: { key },
      create: { key, count: 1, windowStart: now },
      update: { count: 1, windowStart: now },
    });
  } else {
    const bucket = await db.rateLimitBucket.findUnique({ where: { key }, select: { count: true } });
    count = bucket?.count ?? 1;
  }

  return count;
}

/** Housekeeping: windows older than a day can never limit anything again. */
export async function pruneRateLimits(now = new Date()): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
}
