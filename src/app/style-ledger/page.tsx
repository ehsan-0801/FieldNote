import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { BrandLogo } from "@/components/ui/brand-logo";
import mark from "../../../public/brand/fieldnote-atlas-mark.png";
import {
  ArchiveIcon,
  ArrowUpRightIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  NotebookIcon,
  PlusIcon,
  QuotesIcon,
  ShieldWarningIcon,
  SparkleIcon,
  TrayIcon,
  UserCircleIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react/ssr";
import { Priority, WorkOrderStatus } from "@/generated/prisma/enums";
import { PriorityLabel } from "@/components/ui/priority-label";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, InlineNotice } from "@/components/ui/states";
import { DialogDemo } from "./dialog-demo";
import { TokenValue } from "./token-value";

/** Unlisted reference page for the Workshop Ledger theme. Not linked from the app and excluded from indexing. */
export const metadata: Metadata = { title: "Style ledger", robots: { index: false, follow: false } };

const COLOR_GROUPS: { name: string; tokens: { token: string; className: string; use: string }[] }[] = [
  {
    name: "Surfaces",
    tokens: [
      { token: "--color-paper", className: "bg-paper", use: "Page canvas" },
      { token: "--color-paper-deep", className: "bg-paper-deep", use: "Pressed / archived" },
      { token: "--color-chalk", className: "bg-chalk", use: "Panels, inputs" },
      { token: "--color-sidebar", className: "bg-sidebar", use: "Navigation rail" },
      { token: "--color-sidebar-raised", className: "bg-sidebar-raised", use: "Active nav item" },
    ],
  },
  {
    name: "Ink and rules",
    tokens: [
      { token: "--color-ink", className: "bg-ink", use: "Primary text, primary button" },
      { token: "--color-ink-muted", className: "bg-ink-muted", use: "Secondary text (AA on paper)" },
      { token: "--color-rule", className: "bg-rule", use: "Dividers, panel borders" },
      { token: "--color-rule-strong", className: "bg-rule-strong", use: "Input borders" },
    ],
  },
  {
    name: "Signals",
    tokens: [
      { token: "--color-signal", className: "bg-signal", use: "Progress, success, focus ring" },
      { token: "--color-signal-soft", className: "bg-signal-soft", use: "Success tint" },
      { token: "--color-oxide", className: "bg-oxide", use: "Urgent, blocked, destructive" },
      { token: "--color-oxide-soft", className: "bg-oxide-soft", use: "Danger tint" },
      { token: "--color-amber", className: "bg-amber", use: "Needs review (icons, borders)" },
      { token: "--color-amber-ink", className: "bg-amber-ink", use: "Needs review (text)" },
      { token: "--color-amber-soft", className: "bg-amber-soft", use: "Review tint" },
    ],
  },
];

const ICONS = [
  { icon: ClipboardTextIcon, name: "ClipboardText", use: "Work orders" },
  { icon: WrenchIcon, name: "Wrench", use: "In progress, my work" },
  { icon: WarningIcon, name: "Warning", use: "Urgent priority" },
  { icon: ShieldWarningIcon, name: "ShieldWarning", use: "Safety flag" },
  { icon: ClockCounterClockwiseIcon, name: "ClockCounterClockwise", use: "Activity" },
  { icon: UserCircleIcon, name: "UserCircle", use: "Owner, account" },
  { icon: ArrowUpRightIcon, name: "ArrowUpRight", use: "Go to list" },
  { icon: MagnifyingGlassIcon, name: "MagnifyingGlass", use: "Search" },
  { icon: SparkleIcon, name: "Sparkle", use: "AI suggestion" },
  { icon: QuotesIcon, name: "Quotes", use: "Evidence quote" },
  { icon: TrayIcon, name: "Tray", use: "Submitted" },
  { icon: ArchiveIcon, name: "Archive", use: "Archived" },
  { icon: PlusIcon, name: "Plus", use: "New report" },
];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
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

export default function StyleLedgerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <header className="mb-8">
        <p className="label-mono mb-2 flex items-center gap-2">
          <NotebookIcon size={14} aria-hidden /> Internal reference · not linked from the product
        </p>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Workshop Ledger</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          The theme Fieldnote Atlas uses: a field notebook crossed with an operations console. Colour is a signal, never decoration; every
          status and priority also carries an icon and a word. All values below are read live from{" "}
          <span className="font-mono">src/app/globals.css</span>.
        </p>
      </header>

      <Section
        id="logo"
        title="Logo"
        note="Use the full lockup on light surfaces and the light variant on the sidebar. The icon alone is the favicon. Keep clear space of at least the icon’s corner radius."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel grid place-items-center px-6 py-8">
            <BrandLogo height={48} />
          </div>
          <div className="grid place-items-center rounded-panel bg-sidebar px-6 py-8">
            <BrandLogo tone="dark" height={48} />
          </div>
          <div className="panel grid place-items-center px-6 py-8">
            <Image src={mark} alt="FieldNote Atlas icon" width={64} height={64} />
          </div>
        </div>
      </Section>

      <Section id="colour" title="Colour" note="The default Tailwind palette is cleared, so only these tokens exist as utilities.">
        <div className="grid gap-8 md:grid-cols-3">
          {COLOR_GROUPS.map((group) => (
            <div key={group.name}>
              <h3 className="label-mono mb-3">{group.name}</h3>
              <ul className="space-y-2">
                {group.tokens.map((item) => (
                  <li key={item.token} className="flex items-center gap-3">
                    <span className={`size-10 shrink-0 rounded-control border border-rule ${item.className}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-mono text-[12px]">{item.token.replace("--color-", "")}</span>
                      <span className="block text-xs text-ink-muted">{item.use}</span>
                      <TokenValue token={item.token} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="type"
        title="Type"
        note="DM Sans for interface text; IBM Plex Mono for references, timestamps and compact labels. Numbers use tabular figures."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Operations overview · 28/600</p>
            <p className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">Page title · 22/600</p>
            <p className="text-[15px] font-semibold">Section heading · 15/600</p>
            <p className="panel-title">Panel title · 13/600</p>
            <p className="text-sm">Body text · 14/400. The cold tap in the level 2 kitchen won’t turn fully off.</p>
            <p className="text-xs text-ink-muted">Secondary text · 12/400</p>
          </div>
          <div className="space-y-3">
            <p className="ref text-[15px]">WO-1048</p>
            <p className="font-mono text-[28px] leading-none font-medium tabular-nums">1 204</p>
            <p className="label-mono">Label mono · 11 caps</p>
            <p className="font-mono text-[11px] text-ink-muted">18 Oct, 14:32 UTC</p>
          </div>
        </div>
      </Section>

      <Section
        id="signals"
        title="Status and priority"
        note="Status uses icon, word and tint; priority uses icon and word. Unconfirmed priority is marked until a coordinator confirms it."
      >
        <div className="flex flex-wrap gap-2">
          {Object.values(WorkOrderStatus).map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          {Object.values(Priority).map((priority) => (
            <PriorityLabel key={priority} priority={priority} />
          ))}
          <PriorityLabel priority="HIGH" unconfirmed />
        </div>
      </Section>

      <Section id="controls" title="Controls" note="8px radius, thin borders, 150ms colour transitions. Focus is a 2px signal-green ring.">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary">
            Primary
          </button>
          <button type="button" className="btn btn-signal">
            <SparkleIcon size={16} aria-hidden /> Signal
          </button>
          <button type="button" className="btn btn-secondary">
            Secondary
          </button>
          <button type="button" className="btn btn-danger">
            Destructive
          </button>
          <button type="button" className="btn btn-ghost">
            Ghost
          </button>
          <button type="button" className="btn btn-secondary btn-sm">
            Small
          </button>
          <button type="button" className="btn btn-primary" disabled>
            Disabled
          </button>
          <DialogDemo />
        </div>
        <div className="mt-6 grid max-w-3xl gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ledger-input" className="field-label">
              Location
            </label>
            <input id="ledger-input" className="input" defaultValue="Level 2 hallway" />
            <p className="field-hint">Visible label above every field; placeholders are only examples.</p>
          </div>
          <div>
            <label htmlFor="ledger-select" className="field-label">
              Category
            </label>
            <select id="ledger-select" className="input" defaultValue="electrical">
              <option value="electrical">Electrical</option>
              <option value="plumbing">Plumbing</option>
            </select>
          </div>
          <div>
            <label htmlFor="ledger-invalid" className="field-label">
              Title
            </label>
            <input id="ledger-invalid" className="input" aria-invalid defaultValue="" />
            <p className="field-error">Give the work order a short title.</p>
          </div>
          <div>
            <span className="field-label">Factors</span>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-signal" defaultChecked /> Possible safety risk
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ledger-textarea" className="field-label">
              Describe the issue
            </label>
            <textarea
              id="ledger-textarea"
              className="input"
              rows={3}
              defaultValue="The hallway light near room 204 keeps flickering and smells burnt."
            />
          </div>
        </div>
      </Section>

      <Section
        id="feedback"
        title="Feedback states"
        note="Each async surface has loading, empty, error and success copy written for that operation."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <InlineNotice tone="info" title="Rule-based draft">
            No AI provider is configured, so a rule-based draft was made instead.
          </InlineNotice>
          <InlineNotice tone="warning" title="This report is saved. AI suggestions are unavailable right now.">
            Continue manually below; nothing is lost.
          </InlineNotice>
          <InlineNotice tone="danger">Add a resolution note before closing this work.</InlineNotice>
          <InlineNotice tone="success" title="WO-1015 is with the coordinators." />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="panel">
            <EmptyState icon={ClipboardTextIcon} title="No work orders match these filters.">
              Try a broader search, or clear the filters.
            </EmptyState>
          </div>
          <ErrorState title="This page couldn’t load.">Nothing you entered was lost.</ErrorState>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted" role="status">
          <span className="size-2 animate-[ledger-pulse_1.2s_ease-in-out_infinite] rounded-full bg-signal" aria-hidden />
          Loading indicator (pulse is disabled under reduced motion)
        </div>
      </Section>

      <Section
        id="surfaces"
        title="Surfaces and shape"
        note="Panels use a 1px rule and 10px radius; sheets 12px. Shadows only on things that float (menus, dialogs)."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Panel</span>
              <span className="font-mono text-[11px] text-ink-muted">radius-panel</span>
            </div>
            <p className="px-4 py-4 text-sm text-ink-muted">Default container for grouped content.</p>
          </div>
          <figure className="rounded-panel border border-rule bg-paper px-4 py-3">
            <figcaption className="label-mono mb-1.5">Quoted report</figcaption>
            <blockquote className="text-sm">“Everyone on the morning shift was locked out.”</blockquote>
          </figure>
          <div className="rounded-panel bg-sidebar px-4 py-4 text-sm text-sidebar-ink">
            <p className="font-mono text-[10.5px] tracking-[0.08em] text-sidebar-muted uppercase">Sidebar</p>
            <p className="mt-1">Navigation rail, 232px on desktop.</p>
          </div>
        </div>
      </Section>

      <Section
        id="icons"
        title="Icons"
        note="Phosphor only, regular weight at 14–20px; fill weight is reserved for active navigation and urgent markers. No emoji or Unicode symbols as icons."
      >
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {ICONS.map(({ icon: Glyph, name, use }) => (
            <li key={name} className="panel flex flex-col items-start gap-2 px-3 py-3">
              <Glyph size={20} aria-hidden />
              <span className="font-mono text-[11px]">{name}</span>
              <span className="text-xs text-ink-muted">{use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="voice" title="Voice" note="Plain, specific and calm. Say what happened and what to do next.">
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="space-y-1.5 text-sm">
            <li>“No work orders match these filters.”</li>
            <li>“This report is saved. AI suggestions are unavailable right now.”</li>
            <li>“You can’t open this work order with your current access.”</li>
            <li>“Priority suggested from the reported safety risk. Review before assigning.”</li>
          </ul>
          <ul className="space-y-1.5 text-sm text-ink-muted line-through decoration-oxide/60">
            <li>Unlock powerful insights</li>
            <li>Your AI copilot</li>
            <li>Seamlessly transform your workflow</li>
          </ul>
        </div>
      </Section>
    </main>
  );
}
