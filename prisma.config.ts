import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The CLI reads .env.local first (same file Next.js uses), then .env.
config({ path: [".env.local", ".env"], quiet: true });

// Migrations run over the direct connection; PgBouncer-pooled URLs break advisory locks.
const migrationUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
