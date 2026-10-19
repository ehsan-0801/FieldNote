import Link from "next/link";
import {
  ArrowRightIcon,
  ChatCircleTextIcon,
  ClockCounterClockwiseIcon,
  GithubLogoIcon,
  PlugsConnectedIcon,
  QuotesIcon,
  ShieldWarningIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PriorityLabel } from "@/components/ui/priority-label";
import { StatusBadge } from "@/components/ui/status-badge";

const STEPS = [
  {
    title: "Write it the way you’d say it",
    body: "A reporter types a sentence or two. The original wording is saved before anything else happens and is never rewritten.",
  },
  {
    title: "Review a draft, not a verdict",
    body: "Fieldnote proposes a title, category and impact factors, each tied to the phrase it came from. People edit and confirm; nothing is applied silently.",
  },
  {
    title: "Priority you can explain",
    body: "Safety risk, an essential service down, several people affected, getting worse. Ticked factors add up to a band, and the reason is written down.",
  },
  {
    title: "Every move on the record",
    body: "Assignments, status changes and notes form an append-only timeline. Reporters see their own reports; technicians see their own work.",
  },
];

const SOURCE_URL = "https://github.com/ehsan-0801/FieldNote";

const FEATURES = [
  {
    icon: ChatCircleTextIcon,
    title: "An assistant that knows the workspace",
    body: "Ask what needs a decision today or for the latest on a work order. It looks up only what you can already open, and any change it suggests waits for your confirmation.",
  },
  {
    icon: PlugsConnectedIcon,
    title: "Bring any AI provider",
    body: "Paste a key from Gemini, Claude, OpenAI, Groq, OpenRouter, Mistral, DeepSeek and others. The service is recognised, a model is picked and the key is checked before it’s saved, encrypted.",
  },
  {
    icon: UsersThreeIcon,
    title: "Four roles, clear boundaries",
    body: "Reporters, technicians, coordinators and administrators each see and change only what their role allows, checked on the server for every request.",
  },
  {
    icon: ClockCounterClockwiseIcon,
    title: "An audit log you can trust",
    body: "Every sign-in, edit, assignment and setting change is recorded with who did it and when, in the same transaction as the change itself.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <BrandLogo height={38} priority />
        <Link href="/login" className="btn btn-secondary">
          Sign in
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-8">
        <section className="grid gap-10 border-b border-rule pt-10 pb-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-16">
          <div>
            <p className="label-mono mb-4">Issue intake for small facilities teams</p>
            <h1 className="max-w-xl text-[34px] leading-[1.12] font-semibold tracking-[-0.02em] sm:text-[42px]">
              From a rough note to a resolved issue, with every decision visible.
            </h1>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-muted">
              For studios, co-working spaces, campus buildings and community venues where reports arrive as chat messages and corridor
              conversations. Fieldnote Atlas turns them into reviewed, assigned and auditable work orders.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="btn btn-primary h-10 px-4">
                Sign in to your workspace
                <ArrowRightIcon size={16} aria-hidden />
              </Link>
              <a href={SOURCE_URL} className="btn btn-secondary h-10 px-4" target="_blank" rel="noopener noreferrer">
                <GithubLogoIcon size={16} aria-hidden />
                View the source
              </a>
            </div>
          </div>

          <figure className="panel overflow-hidden" aria-label="Example: a hallway light report becomes a work order">
            <div className="border-b border-rule bg-paper px-5 py-4">
              <p className="label-mono mb-1.5">Original note</p>
              <blockquote className="flex gap-2 text-[15px] leading-relaxed">
                <QuotesIcon size={16} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
                The hallway light near room 204 keeps flickering and smells burnt.
              </blockquote>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="ref">WO-1015</span>
                <StatusBadge status="TRIAGE" />
                <PriorityLabel priority="URGENT" unconfirmed />
              </div>
              <p className="font-medium">Flickering hallway light with burning smell</p>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-start gap-2">
                  <ShieldWarningIcon size={15} className="mt-0.5 shrink-0 text-oxide" aria-hidden />
                  <span>
                    Possible safety risk <span className="text-ink-muted">from “smells burnt”</span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldWarningIcon size={15} className="mt-0.5 shrink-0 text-amber" aria-hidden />
                  <span>
                    Getting worse over time <span className="text-ink-muted">from “keeps flickering”</span>
                  </span>
                </li>
              </ul>
              <p className="border-t border-rule pt-3 text-[13px] text-ink-muted">
                Urgent: possible safety risk reported and the issue is getting worse. Safety flag requires coordinator review.
              </p>
            </div>
            <figcaption className="sr-only">An illustration of the review step using the demo report.</figcaption>
          </figure>
        </section>

        <section className="pt-12" aria-labelledby="how-heading">
          <h2 id="how-heading" className="label-mono mb-6">
            How it works
          </h2>
          <ol className="divide-y divide-rule border-y border-rule">
            {STEPS.map((step, index) => (
              <li key={step.title} className="grid gap-2 py-5 sm:grid-cols-[80px_260px_1fr] sm:gap-6">
                <span className="font-mono text-sm text-ink-muted tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-sm text-ink-muted">
            AI is optional. Without a provider key, or when the provider is slow, a clearly labelled rule-based draft is used and everything
            else works the same.
          </p>
        </section>

        <section className="pt-14" aria-labelledby="features-heading">
          <h2 id="features-heading" className="label-mono mb-6">
            What’s inside
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="panel px-5 py-5">
                <feature.icon size={22} className="text-signal" aria-hidden />
                <h3 className="mt-3 font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 px-4 py-6 text-xs text-ink-muted sm:px-8">
          <span>
            Fieldnote Atlas ·{" "}
            <a href={SOURCE_URL} className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noopener noreferrer">
              Source on GitHub
            </a>
          </span>
          <span>Priority suggestions are not a professional safety assessment.</span>
        </div>
      </footer>
    </div>
  );
}
