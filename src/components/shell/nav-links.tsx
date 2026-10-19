"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatCircleTextIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  PlugsConnectedIcon,
  PlusIcon,
  ScrollIcon,
  SquaresFourIcon,
  TagIcon,
  UsersIcon,
  WrenchIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { NavIcon, NavItem } from "./navigation";

export const NAV_ICONS: Record<NavIcon, Icon> = {
  overview: SquaresFourIcon,
  work: ClipboardTextIcon,
  myWork: WrenchIcon,
  new: PlusIcon,
  activity: ClockCounterClockwiseIcon,
  assistant: ChatCircleTextIcon,
  users: UsersIcon,
  categories: TagIcon,
  aiProviders: PlugsConnectedIcon,
  audit: ScrollIcon,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/work-orders") return pathname.startsWith("/app/work-orders") && pathname !== "/app/work-orders/new";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNavigation({ main, admin }: { main: NavItem[]; admin: NavItem[] }) {
  const pathname = usePathname();
  const renderItem = (item: NavItem) => {
    const ItemIcon = NAV_ICONS[item.icon];
    const active = isActive(pathname, item.href);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex h-9 items-center gap-2.5 rounded-control px-3 text-sm transition-colors duration-150 ${
            active
              ? "bg-sidebar-raised font-medium text-sidebar-ink"
              : "text-sidebar-muted hover:bg-sidebar-raised/60 hover:text-sidebar-ink"
          }`}
        >
          <ItemIcon size={18} aria-hidden />
          {item.label}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-0.5">{main.map(renderItem)}</ul>
      {admin.length > 0 ? (
        <div>
          <p className="mb-1.5 px-3 font-mono text-[10.5px] tracking-[0.08em] text-sidebar-muted uppercase">Administration</p>
          <ul className="flex flex-col gap-0.5">{admin.map(renderItem)}</ul>
        </div>
      ) : null}
    </nav>
  );
}

export function MobileNavigation({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-chalk/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const ItemIcon = NAV_ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-signal" : "text-ink-muted"}`}
              >
                <ItemIcon size={20} weight={active ? "fill" : "regular"} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
