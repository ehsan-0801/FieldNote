/**
 * Provisional title from the first sentence of a report. Used by the server when a
 * report is filed and by the review form, so both show the same starting title.
 */
export function draftTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const firstSentence = normalized.split(/(?<=[.!?])\s/)[0] ?? normalized;
  const cleaned = firstSentence.replace(/[.!?]+$/, "");
  if (cleaned.length <= 80) return capitalize(cleaned);
  const cut = cleaned.slice(0, 80);
  return `${capitalize(cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : 80))}…`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
