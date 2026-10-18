import { testDatabaseEnv } from "./test-database";

const { url, schema } = testDatabaseEnv();
process.env.DATABASE_URL = url;
process.env.DATABASE_SCHEMA = schema;
// Integration tests exercise the provider path with a stubbed fetch; no real key is used.
process.env.AI_PROVIDER = "gemini";
process.env.GEMINI_API_KEY = "test-key-not-real";
process.env.AI_TIMEOUT_MS = "1000";
