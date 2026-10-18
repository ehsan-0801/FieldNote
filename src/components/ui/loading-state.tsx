/** Compact progress indicator for content streaming in below a static page header. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-10 text-sm text-ink-muted">
      <span className="size-2 animate-[ledger-pulse_1.2s_ease-in-out_infinite] rounded-full bg-signal" aria-hidden />
      {label}
    </div>
  );
}
