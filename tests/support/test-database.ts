import { config } from "dotenv";

/**
 * Integration tests run against a dedicated Postgres schema on the configured
 * database, never `public`, so demo data is untouched.
 */
export function testDatabaseEnv() {
  config({ path: [".env.local", ".env"], quiet: true });
  const schema = process.env.TEST_DATABASE_SCHEMA || "fieldnote_test";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema) || schema === "public") {
    throw new Error(`TEST_DATABASE_SCHEMA must be a dedicated schema name, got “${schema}”.`);
  }
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (and ideally DATABASE_URL_UNPOOLED) to run integration tests.");
  return { url, schema };
}
