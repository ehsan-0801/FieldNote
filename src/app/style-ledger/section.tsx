import type { ReactNode } from "react";

export function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-rule py-10">
      <div className="mb-5">
        <h2 id={id} className="text-lg font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {note ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}
