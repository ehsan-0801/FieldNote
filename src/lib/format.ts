const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Absolute timestamps are rendered in UTC and labelled, so server and client output always match. */
export function formatDateTime(value: Date | string): string {
  return `${dateTime.format(new Date(value))} UTC`;
}

export function formatDate(value: Date | string): string {
  return dateOnly.format(new Date(value));
}

export function formatAge(value: Date | string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
