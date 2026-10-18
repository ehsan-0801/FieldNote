"use client";

import { ErrorState } from "@/components/ui/states";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <ErrorState
      title="This page couldn’t load."
      action={
        <button type="button" className="btn btn-secondary" onClick={() => retry()}>
          Try again
        </button>
      }
    >
      Nothing you entered was lost. If it keeps happening, share this reference with your administrator:{" "}
      <span className="ref">{digest ?? "unavailable"}</span>
    </ErrorState>
  );
}
