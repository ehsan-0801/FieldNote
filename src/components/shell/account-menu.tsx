"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CaretDownIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react/ssr";
import { anyData, callApi } from "@/lib/api-client";

export function AccountMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      const outside = event.target instanceof Node && !container.current?.contains(event.target);
      if (event instanceof KeyboardEvent ? event.key === "Escape" : outside) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await callApi("/api/auth/logout", { method: "POST", body: {}, schema: anyData });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        className="btn btn-ghost h-10 gap-2 px-2"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        <UserCircleIcon size={22} aria-hidden />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium text-ink">{name}</span>
          <span className="block text-[11px] text-ink-muted">{roleLabel}</span>
        </span>
        <CaretDownIcon size={14} aria-hidden />
        <span className="sr-only">Account menu</span>
      </button>
      {open ? (
        <div className="panel absolute right-0 z-40 mt-1.5 w-64 p-1.5 shadow-[0_12px_32px_-18px_rgba(32,39,36,0.5)]">
          <div className="border-b border-rule px-2.5 pt-1.5 pb-2.5">
            <p className="text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-ink-muted">{email}</p>
            <p className="label-mono mt-1.5">{roleLabel}</p>
          </div>
          <button type="button" className="btn btn-ghost mt-1 w-full justify-start" onClick={signOut} disabled={signingOut}>
            <SignOutIcon size={16} aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
