import { Priority } from "@/generated/prisma/enums";

/**
 * Priority is a transparent sum of human-confirmed factors. The AI may propose
 * factors (with evidence), but the score and band are always computed here.
 */
export const PRIORITY_FACTORS = [
  {
    signal: "SAFETY_RISK",
    field: "safetyFlag",
    weight: 5,
    label: "Possible safety risk",
    rationale: "possible safety risk reported",
  },
  {
    signal: "ESSENTIAL_SERVICE_DOWN",
    field: "essentialServiceDown",
    weight: 4,
    label: "Essential service unavailable",
    rationale: "an essential service is unavailable",
  },
  {
    signal: "MULTIPLE_PEOPLE_AFFECTED",
    field: "multiplePeopleAffected",
    weight: 3,
    label: "Multiple people affected",
    rationale: "several people are affected",
  },
  {
    signal: "WORSENING",
    field: "worsening",
    weight: 2,
    label: "Getting worse over time",
    rationale: "the issue is getting worse",
  },
] as const;

export type PriorityFactor = (typeof PRIORITY_FACTORS)[number];
export type PrioritySignal = PriorityFactor["signal"];
export type PriorityFactorField = PriorityFactor["field"];
export type PriorityFactorValues = Record<PriorityFactorField, boolean>;

// Tuple type is required by z.enum; PRIORITY_FACTORS is a non-empty literal, so the cast is exact.
export const PRIORITY_SIGNALS = PRIORITY_FACTORS.map((factor) => factor.signal) as [PrioritySignal, ...PrioritySignal[]];

export const NO_FACTORS: PriorityFactorValues = {
  safetyFlag: false,
  essentialServiceDown: false,
  multiplePeopleAffected: false,
  worsening: false,
};

export const PRIORITY_ORDER: readonly Priority[] = [Priority.URGENT, Priority.HIGH, Priority.NORMAL, Priority.LOW];

export const PRIORITY_LABEL: Record<Priority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
};

export function priorityForScore(score: number): Priority {
  if (score >= 7) return Priority.URGENT;
  if (score >= 4) return Priority.HIGH;
  if (score >= 2) return Priority.NORMAL;
  return Priority.LOW;
}

export interface PriorityAssessment {
  score: number;
  priority: Priority;
  rationale: string;
}

export function assessPriority(factors: PriorityFactorValues): PriorityAssessment {
  const active = PRIORITY_FACTORS.filter((factor) => factors[factor.field]);
  const score = active.reduce((total, factor) => total + factor.weight, 0);
  const priority = priorityForScore(score);

  const reasons = active.map((factor) => factor.rationale);
  let rationale =
    reasons.length === 0
      ? `${PRIORITY_LABEL[priority]}: no impact factors confirmed; treated as low-impact.`
      : `${PRIORITY_LABEL[priority]}: ${joinReasons(reasons)}.`;
  if (factors.safetyFlag) {
    rationale += " Safety flag requires coordinator review; this is not a professional safety assessment.";
  }
  return { score, priority, rationale };
}

function joinReasons(reasons: string[]): string {
  if (reasons.length <= 1) return reasons.join("");
  return `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
}

export function factorsFromSignals(signals: readonly PrioritySignal[]): PriorityFactorValues {
  const values = { ...NO_FACTORS };
  for (const factor of PRIORITY_FACTORS) {
    if (signals.includes(factor.signal)) values[factor.field] = true;
  }
  return values;
}
