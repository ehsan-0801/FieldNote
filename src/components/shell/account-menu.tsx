"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CaretDownIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react/ssr";
import { anyData, callApi } from "@/lib/api-client";
import { NAV_ICONS } from "./nav-links";
import type { NavItem } from "./navigation";

/**
 * Account details and sign-out. Below the sidebar breakpoint it also carries the
 * sections that don't fit the four-slot bottom bar (admin pages, My work, Assistant).
 */
export function AccountMenu({ name, email, roleLabel, links }: { name: string; email: string; roleLabel: string; links: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(null);
    const result = await callApi("/api/auth/logout", { method: "POST", body: {}, schema: anyData });
    if (!result.ok) {
      setSigningOut(false);
      setSignOutError(result.error.message);
      return;
    }
    // The app shell stays mounted (hidden) after navigating away, so reset the menu
    // or the next person to sign in on this tab would see "Signing out…".
    setOpen(false);
    setSigningOut(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        type="button"
        className="btn btn-ghost h-10 gap-2 px-2"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <UserCircleIcon size={22} aria-hidden />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium text-ink">{name}</span>
          <span className="block text-[11px] text-ink-muted">{roleLabel}</span>
        </span>
        <CaretDownIcon size={14} aria-hidden />
        <span className="sr-only">Account and more pages</span>
      </button>
      {open ? (
        <div id={panelId} className="panel absolute right-0 z-40 mt-1.5 w-64 p-1.5 shadow-[0_12px_32px_-18px_rgba(32,39,36,0.5)]">
          <div className="border-b border-rule px-2.5 pt-1.5 pb-2.5">
            <p className="text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-ink-muted">{email}</p>
            <p className="label-mono mt-1.5">{roleLabel}</p>
          </div>
          {links.length > 0 ? (
            <nav aria-label="More pages" className="border-b border-rule py-1 lg:hidden">
              <ul>
                {links.map((item) => {
                  const ItemIcon = NAV_ICONS[item.icon];
                  return (
                    <li key={item.href}>
                      <Link href={item.href} className="btn btn-ghost w-full justify-start text-ink" onClick={() => setOpen(false)}>
                        <ItemIcon size={16} aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
          <button type="button" className="btn btn-ghost mt-1 w-full justify-start" onClick={signOut} disabled={signingOut}>
            <SignOutIcon size={16} aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {signOutError ? (
            <p role="alert" className="px-2.5 pt-1 pb-1.5 text-xs text-oxide">
              {signOutError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
