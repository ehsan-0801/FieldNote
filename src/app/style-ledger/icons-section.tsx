import {
  ArchiveIcon,
  ArrowUpRightIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  QuotesIcon,
  ShieldWarningIcon,
  SparkleIcon,
  TrayIcon,
  UserCircleIcon,
  WarningIcon,
  WrenchIcon,
} from "@phosphor-icons/react/ssr";
import { Section } from "./section";

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

export function IconsSection() {
  return (
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
  );
}
