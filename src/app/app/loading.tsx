export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 py-10 text-sm text-ink-muted">
      <span className="size-2 animate-[ledger-pulse_1.2s_ease-in-out_infinite] rounded-full bg-signal" aria-hidden />
      Loading…
    </div>
  );
}
