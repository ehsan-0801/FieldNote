import "server-only";
import { DomainError } from "@/domain/errors";
import { db } from "./db";

export const RATE_LIMITS = {
  // Per client IP: generous enough for a shared office network.
  loginIp: { limit: 20, windowSeconds: 15 * 60 },
  // Per account: slows password guessing against one person.
  loginEmail: { limit: 8, windowSeconds: 15 * 60 },
  aiParse: { limit: 12, windowSeconds: 10 * 60 },
  mutation: { limit: 120, windowSeconds: 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Fixed-window counter stored in Postgres so it holds across serverless instances.
 * Two requests racing on an expired window can both reset it to 1; that slight
 * undercount is acceptable for abuse protection.
 */
export async function enforceRateLimit(name: RateLimitName, subject: string): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const key = `${name}:${subject}`;
  const now = new Date();
  const windowOpenedAfter = new Date(now.getTime() - windowSeconds * 1000);

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

  if (count > limit) {
    throw new DomainError("RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.");
  }
}
