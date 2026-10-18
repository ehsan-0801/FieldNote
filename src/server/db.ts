import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { serverEnv } from "./env";

declare global {
  // Reused across hot reloads in development so each edit doesn't open a new pool.
  var fieldnotePrismaCache: { client: PrismaClient; generatedClass: typeof PrismaClient } | undefined;
}

function createClient(): PrismaClient {
  const env = serverEnv();
  const adapter = new PrismaPg(
    { connectionString: env.DATABASE_URL, max: 5 },
    env.DATABASE_SCHEMA ? { schema: env.DATABASE_SCHEMA } : undefined,
  );
  return new PrismaClient({ adapter });
}

/**
 * After `prisma generate` the dev server reloads the generated module, giving a new
 * PrismaClient class. A cached instance of the old class lacks new models, so it is
 * replaced rather than reused.
 */
function developmentClient(): PrismaClient {
  const cached = globalThis.fieldnotePrismaCache;
  if (cached?.generatedClass === PrismaClient) return cached.client;
  cached?.client.$disconnect().catch(() => undefined);
  const client = createClient();
  globalThis.fieldnotePrismaCache = { client, generatedClass: PrismaClient };
  return client;
}

export const db: PrismaClient = process.env.NODE_ENV === "production" ? createClient() : developmentClient();

export type Tx = Prisma.TransactionClient;
