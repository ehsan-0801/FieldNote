/**
 * Smoke-test evaluation of report extraction against tests/fixtures/extraction-cases.json.
 * Uses the configured provider (AI_PROVIDER + key) or, without one, the rule-based fallback.
 * Twenty hand-written cases measure behaviour; they do not establish accuracy.
 *
 *   pnpm eval:ai
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { z } from "zod";
import { Priority } from "../src/generated/prisma/enums";
import { assessPriority, factorsFromSignals, PRIORITY_SIGNALS } from "../src/domain/priority";
import { redactContactDetails } from "../src/server/ai/redact";
import { runExtraction, selectProvider } from "../src/server/ai/run-extraction";

config({ path: [".env.local", ".env"], quiet: true });

const cases = z
  .array(z.object({ report: z.string(), category: z.string(), priority: z.enum(Priority), signals: z.array(z.enum(PRIORITY_SIGNALS)) }))
  .parse(JSON.parse(readFileSync("tests/fixtures/extraction-cases.json", "utf8")));

const categories = [
  { slug: "electrical", name: "Electrical" },
  { slug: "plumbing", name: "Plumbing" },
  { slug: "heating-ventilation", name: "Heating & ventilation" },
  { slug: "doors-access", name: "Doors & access" },
  { slug: "cleaning-waste", name: "Cleaning & waste" },
  { slug: "furniture-fixtures", name: "Furniture & fixtures" },
  { slug: "it-av", name: "IT & AV" },
  { slug: "grounds", name: "Grounds" },
];

const selection = selectProvider({
  AI_PROVIDER: z.enum(["gemini", "groq", "none"]).catch("gemini").parse(process.env.AI_PROVIDER),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-flash-latest",
  GROQ_API_KEY: process.env.GROQ_API_KEY || undefined,
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
});

let categoryMatches = 0;
let bandMatches = 0;
let succeeded = 0;
let fallbacks = 0;
const latencies: number[] = [];
const errors = new Map<string, number>();

for (const testCase of cases) {
  const run = await runExtraction(
    { report: redactContactDetails(testCase.report), locationLabel: null, assetLabel: null, categories },
    selection,
    {
      timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 8000,
    },
  );
  // Priority band is the one a reviewer gets by accepting the suggested factors.
  const band = assessPriority(factorsFromSignals(run.suggestion.signals.map((signal) => signal.factor))).priority;
  if (run.suggestion.categorySlug === testCase.category) categoryMatches++;
  if (band === testCase.priority) bandMatches++;
  if (run.status === "SUCCEEDED") succeeded++;
  else fallbacks++;
  if (run.errorCode) errors.set(run.errorCode, (errors.get(run.errorCode) ?? 0) + 1);
  latencies.push(run.latencyMs);
  const mark = (ok: boolean) => (ok ? "ok  " : "MISS");
  console.log(
    `${mark(run.suggestion.categorySlug === testCase.category)} ${mark(band === testCase.priority)} ${testCase.report.slice(0, 70)}`,
  );
}

const pct = (value: number) => `${value}/${cases.length} (${Math.round((value / cases.length) * 100)}%)`;
latencies.sort((a, b) => a - b);
console.log("\nSmoke-test evaluation, not an accuracy claim");
console.log(
  `source            ${selection.provider ? `${selection.provider.name} · ${selection.provider.model}` : "rule-based fallback (no provider configured)"}`,
);
console.log(`category match    ${pct(categoryMatches)}`);
console.log(`priority band     ${pct(bandMatches)}`);
console.log(`schema-valid      ${selection.provider ? pct(succeeded) : "n/a (no model output)"}`);
console.log(`fallback used     ${pct(fallbacks)}${errors.size ? `  ${[...errors].map(([code, n]) => `${code}×${n}`).join(", ")}` : ""}`);
console.log(`latency p50/max   ${latencies[Math.floor(latencies.length / 2)]}ms / ${latencies.at(-1)}ms`);
