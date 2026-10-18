"use client";

import { useSyncExternalStore } from "react";

// Tokens don't change at runtime, so there is nothing to subscribe to.
const subscribe = () => () => {};

/** Reads the live CSS custom property, so this reference can never drift from globals.css. */
export function TokenValue({ token }: { token: string }) {
  const value = useSyncExternalStore(
    subscribe,
    () => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    () => "",
  );
  return <span className="font-mono text-[11px] text-ink-muted">{value || "…"}</span>;
}
