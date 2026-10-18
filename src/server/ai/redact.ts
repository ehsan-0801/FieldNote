const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digits with optional separators, optional leading +; avoids room numbers like "204".
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){2,4}/g;

/** Strips contact details before text leaves the server for a model provider. */
export function redactContactDetails(text: string): string {
  return text.replace(EMAIL, "[email removed]").replace(PHONE, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 7 ? "[phone removed]" : match;
  });
}
