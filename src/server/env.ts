import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, { error: "DATABASE_URL is required." }),
  /** Only set by the integration test setup; production always uses the URL's default schema. */
  DATABASE_SCHEMA: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[a-z_][a-z0-9_]*$/)
      .optional(),
  ),
  SESSION_SECRET: z.string().min(32, { error: "SESSION_SECRET must be at least 32 characters." }),
  AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["gemini", "groq", "none"]).default("gemini")),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default("gemini-flash-latest")),
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GROQ_MODEL: z.preprocess(emptyToUndefined, z.string().default("openai/gpt-oss-20b")),
  AI_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1000).max(30_000).default(8000)),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | undefined;

/** Validated server configuration. Parsed lazily so a misconfiguration fails on first use with a clear message. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid server environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === "production";
