import { defineConfig } from "@playwright/test";
import { testDatabaseEnv } from "./tests/support/test-database";

const PORT = 3200;
const { url, schema } = testDatabaseEnv();

/**
 * End-to-end tests run the production build against the isolated test schema,
 * re-seeded with demo data, with AI disabled so drafts are deterministic.
 * Uses the locally installed Chrome; set PLAYWRIGHT_CHANNEL="" to use Playwright's Chromium.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: url, DATABASE_SCHEMA: schema, AI_PROVIDER: "none" },
  },
});
