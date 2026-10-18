import { execFileSync } from "node:child_process";
import pg from "pg";
import { testDatabaseEnv } from "../support/test-database";

const TABLES = [
  "ChatMessage",
  "ChatConversation",
  "AuditEvent",
  "AiExtraction",
  "StatusEvent",
  "WorkOrderNote",
  "WorkOrder",
  "Session",
  "Category",
  "User",
  "Workspace",
  "RateLimitBucket",
];

/** Brings the dedicated test schema up to date, empties it and loads the demo data. Never touches `public`. */
export default async function globalSetup() {
  const { url, schema } = testDatabaseEnv();
  const schemaUrl = new URL(url);
  schemaUrl.searchParams.set("schema", schema);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: schemaUrl.toString() },
    stdio: "pipe",
  });

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    // testDatabaseEnv() already rejects "public" and anything that isn't a plain identifier.
    await client.query(`TRUNCATE TABLE ${TABLES.map((table) => `"${schema}"."${table}"`).join(", ")} CASCADE`);
  } finally {
    await client.end();
  }

  execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: url, DATABASE_SCHEMA: schema },
    stdio: "pipe",
  });
}
