"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react/ssr";

/**
 * Native modal <dialog>: the browser makes the page behind it inert and traps
 * focus. We add focus restoration and a consistent frame.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  placement = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** "sheet" docks to the bottom on small screens (mobile filters). */
  placement?: "center" | "sheet";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  const position =
    placement === "sheet"
      ? "mt-auto mb-0 w-full max-w-none rounded-b-none sm:m-auto sm:max-w-lg sm:rounded-sheet"
      : "m-auto w-[calc(100%-2rem)] max-w-lg";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`${position} rounded-sheet border border-rule bg-chalk p-0 text-ink shadow-[0_18px_50px_-20px_rgba(32,39,36,0.45)] backdrop:bg-ink/35 open:animate-[dialog-in_180ms_var(--ease-ledger)]`}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
        <div>
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          {description ? <div className="mt-1 text-sm text-ink-muted">{description}</div> : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm -mt-1 -mr-2 px-2"
          onClick={() => ref.current?.close()}
          aria-label="Close dialog"
        >
          <XIcon size={16} aria-hidden />
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
