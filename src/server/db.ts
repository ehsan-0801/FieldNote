import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { serverEnv } from "./env";

declare global {
  // Reused across hot reloads in development so each edit doesn't open a new pool.
  var fieldnotePrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const env = serverEnv();
  const adapter = new PrismaPg(
    { connectionString: env.DATABASE_URL, max: 5 },
    env.DATABASE_SCHEMA ? { schema: env.DATABASE_SCHEMA } : undefined,
  );
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalThis.fieldnotePrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.fieldnotePrisma = db;

export type Tx = Prisma.TransactionClient;
