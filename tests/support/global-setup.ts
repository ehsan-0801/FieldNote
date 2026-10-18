import { execFileSync } from "node:child_process";
import { testDatabaseEnv } from "./test-database";

export default function setup() {
  const { url, schema } = testDatabaseEnv();
  const migrateUrl = new URL(url);
  migrateUrl.searchParams.set("schema", schema);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL_UNPOOLED: migrateUrl.toString() },
  });
}
