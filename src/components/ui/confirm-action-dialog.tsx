"use client";

import { useState, type ReactNode } from "react";
import { Dialog } from "./dialog";
import { InlineNotice } from "./states";

/** Confirmation for destructive or privilege-changing actions; the server still authorises. */
export function ConfirmActionDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = "primary",
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** Return an error message to keep the dialog open, or null when done. */
  onConfirm: () => Promise<string | null>;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    const failure = await onConfirm();
    setPending(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      {children}
      {error ? (
        <div className="mt-3">
          <InlineNotice tone="danger" live>
            {error}
          </InlineNotice>
        </div>
      ) : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={confirm} disabled={pending}>
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
