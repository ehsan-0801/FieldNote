import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ChatCircleTextIcon, MagnifyingGlassIcon, NotebookIcon } from "@phosphor-icons/react/ssr";
import { requirePageUser } from "@/server/auth/session";
import { AccountMenu } from "./account-menu";
import { MobileNavigation, SidebarNavigation } from "./nav-links";
import { ROLE_LABEL, navigationFor } from "./navigation";

function Wordmark({ tone }: { tone: "dark" | "light" }) {
  return (
    <Link href="/app" className={`flex items-center gap-2 ${tone === "dark" ? "text-sidebar-ink" : "text-ink"}`}>
      <span className={`grid size-7 place-items-center rounded-[7px] ${tone === "dark" ? "bg-signal text-chalk" : "bg-ink text-chalk"}`}>
        <NotebookIcon size={16} weight="bold" aria-hidden />
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Fieldnote Atlas</span>
    </Link>
  );
}

async function Sidebar() {
  const user = await requirePageUser();
  const nav = navigationFor(user.role);
  return (
    <>
      <div className="flex-1">
        <SidebarNavigation main={nav.main} admin={nav.admin} />
      </div>
      <div className="border-t border-white/10 pt-4">
        <p className="font-mono text-[10.5px] tracking-[0.08em] text-sidebar-muted uppercase">Workspace</p>
        <p className="mt-1 text-sm text-sidebar-ink">{user.workspaceName}</p>
      </div>
    </>
  );
}

async function TopBarAccount() {
  const user = await requirePageUser();
  return (
    <>
      <span className="hidden font-mono text-xs text-ink-muted md:inline">{user.workspaceName}</span>
      <AccountMenu name={user.name} email={user.email} roleLabel={ROLE_LABEL[user.role]} />
    </>
  );
}

async function BottomNavigation() {
  const user = await requirePageUser();
  return <MobileNavigation items={navigationFor(user.role).main.filter((item) => item.mobile)} />;
}

function NavSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col gap-1.5">
      {[0, 1, 2, 3].map((key) => (
        <li key={key} className="h-9 animate-[ledger-pulse_1.4s_ease-in-out_infinite] rounded-control bg-sidebar-raised/60" />
      ))}
    </ul>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-chalk focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 bg-sidebar px-4 py-5 lg:flex">
        <Wordmark tone="dark" />
        <Suspense fallback={<NavSkeleton />}>
          <Sidebar />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-rule bg-paper/95 px-4 backdrop-blur-sm sm:px-7 lg:px-9">
          <div className="lg:hidden">
            <Wordmark tone="light" />
          </div>
          <form action="/app/work-orders" role="search" className="relative ml-auto hidden w-full max-w-sm md:block lg:ml-0">
            <label htmlFor="global-search" className="sr-only">
              Search work orders
            </label>
            <MagnifyingGlassIcon
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input id="global-search" name="q" type="search" className="input pl-9" placeholder="Search by reference, title or place" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            {/* The bottom bar has four slots, so the assistant is reached from here on small screens. */}
            <Link href="/app/assistant" className="btn btn-ghost px-2 lg:hidden" aria-label="Assistant">
              <ChatCircleTextIcon size={20} aria-hidden />
            </Link>
            <Suspense fallback={<span className="h-10 w-32" aria-hidden />}>
              <TopBarAccount />
            </Suspense>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-6 pb-24 sm:px-7 lg:px-9 lg:pt-8 lg:pb-12">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <BottomNavigation />
      </Suspense>
    </div>
  );
}
