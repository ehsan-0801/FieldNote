import type { EvidenceSignal, ExtractionSuggestion } from "@/domain/extraction";
import { PRIORITY_SIGNALS, assessPriority, factorsFromSignals, type PrioritySignal } from "@/domain/priority";
import type { ExtractionInput } from "./types";

export const FALLBACK_PROVIDER = "rules";
export const FALLBACK_MODEL = "keyword-rules-v1";

/**
 * Deterministic draft used when no model answer is available. It only extracts
 * signals it can quote verbatim and leaves everything else for the reviewer.
 */
const SIGNAL_PATTERNS: Record<PrioritySignal, RegExp> = {
  SAFETY_RISK:
    /\b(smells? (?:of )?(?:burn(?:t|ing)|smoke|gas)|burn(?:t|ing) smell|smok(?:e|ing)|sparks?|sparking|exposed wir(?:e|es|ing)|live wire|(?:electric(?:al)? )?shock(?:ed)?|gas leak|scorch(?:ed|ing)?|melt(?:ed|ing)|trip(?:ping)? hazard|slippery|ceiling (?:tile )?(?:fell|has fallen|collapsed)|broken glass|carbon monoxide|water (?:near|on|in) (?:the )?(?:socket|outlet|electrics|wiring))\b/i,
  ESSENTIAL_SERVICE_DOWN:
    /\b(no (?:power|electricity|water|heat(?:ing)?|hot water|internet|wi-?fi)|power (?:is )?(?:out|down)|outage|toilets? (?:is |are )?(?:blocked|clogged|overflowing|not flushing)|(?:heating|boiler|lift|elevator|fridge|freezer) (?:is )?(?:down|broken|not working|out of (?:service|order))|locked out|(?:won'?t|doesn'?t|does not) lock)\b/i,
  MULTIPLE_PEOPLE_AFFECTED:
    /\b(everyone|everybody|whole (?:floor|building|office|team|class|wing)|entire (?:floor|building|office)|all (?:the )?(?:staff|students|residents|members|tenants|desks|rooms)|several (?:people|rooms|desks|of us)|multiple (?:people|rooms|desks)|both (?:floors|rooms|kitchens))\b/i,
  WORSENING:
    /\b(getting worse|worsening|spreading|keeps? (?:getting worse|coming back|happening|flickering|dripping|leaking|tripping)|more and more|bigger (?:every|each) day|for (?:days|weeks)|since (?:monday|tuesday|wednesday|thursday|friday|last week|yesterday))\b/i,
};

const CATEGORY_KEYWORDS: Record<string, RegExp> = {
  electrical: /\b(light|lights|lamp|bulb|socket|outlet|switch|power|wir(?:e|ing)|breaker|fuse|flicker\w*)\b/gi,
  plumbing: /\b(leak\w*|drip\w*|tap|faucet|sink|toilet|pipe|drain|flood\w*|water)\b/gi,
  "heating-ventilation": /\b(heating|radiator|air ?con\w*|a\/?c unit|ventilation|thermostat|boiler|too (?:hot|cold)|draught|draft)\b/gi,
  "doors-access": /\b(door|lock|key|badge|fob|hinge|keypad|entry)\b/gi,
  "cleaning-waste": /\b(spill\w*|bins?|trash|rubbish|recycling|pests?|mice|mouse|cleaning|mess)\b/gi,
  "furniture-fixtures": /\b(chair|desk|table|shelf|shelving|cabinet|blind|curtain)\b/gi,
  "it-av": /\b(projector|screen|wi-?fi|printer|network|hdmi|speaker|monitor|display)\b/gi,
  grounds: /\b(path|parking|garden|gate|outdoor|bike rack|snow|ice|courtyard)\b/gi,
};

export function ruleBasedExtraction(input: ExtractionInput): ExtractionSuggestion {
  const text = input.report.replace(/\s+/g, " ").trim();
  const signals: EvidenceSignal[] = [];
  for (const factor of PRIORITY_SIGNALS) {
    const match = SIGNAL_PATTERNS[factor].exec(text);
    if (match) signals.push({ factor, evidence: match[0] });
  }

  const assessment = assessPriority(factorsFromSignals(signals.map((signal) => signal.factor)));
  const categorySlug = guessCategory(
    text,
    input.categories.map((category) => category.slug),
  );

  return {
    suggestedTitle: draftTitle(text),
    summary: text.slice(0, 600),
    categorySlug,
    suggestedPriority: assessment.priority,
    signals,
    missingDetails: missingDetails(text, input, signals),
    suggestedNextStep: signals.some((signal) => signal.factor === "SAFETY_RISK")
      ? "Coordinator to review the safety flag and decide whether to close off the area before assigning."
      : "Coordinator to confirm the category and priority, then assign a technician.",
    confidence: null,
  };
}

export function draftTitle(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const cleaned = firstSentence.replace(/[.!?]+$/, "");
  if (cleaned.length <= 80) return capitalize(cleaned);
  const cut = cleaned.slice(0, 80);
  return `${capitalize(cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 80))}…`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function guessCategory(text: string, availableSlugs: readonly string[]): string | null {
  let best: { slug: string; hits: number } | null = null;
  for (const slug of availableSlugs) {
    const pattern = CATEGORY_KEYWORDS[slug];
    if (!pattern) continue;
    const hits = text.match(pattern)?.length ?? 0;
    if (hits > 0 && (!best || hits > best.hits)) best = { slug, hits };
  }
  return best?.slug ?? null;
}

function missingDetails(text: string, input: ExtractionInput, signals: EvidenceSignal[]): string[] {
  const questions: string[] = [];
  const mentionsPlace =
    /\b(room|floor|level|kitchen|hall(?:way)?|corridor|stair\w*|lobby|toilets?|bathroom|office|studio|entrance|car park|desk)\b/i;
  if (!input.locationLabel && !mentionsPlace.test(text)) {
    questions.push("Where exactly is this (building, floor, room)?");
  }
  if (
    !/\b(today|yesterday|this morning|tonight|since|ago|last (?:week|night)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      text,
    )
  ) {
    questions.push("When did you first notice it?");
  }
  if (signals.some((signal) => signal.factor === "SAFETY_RISK")) {
    questions.push("Is the area still in use, or has anyone closed it off?");
  }
  if (!input.assetLabel) {
    questions.push("Which fixture or equipment is affected, if there is a label or number on it?");
  }
  return questions.slice(0, 3);
}
