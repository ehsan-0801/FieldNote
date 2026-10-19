import { Section } from "./section";
import { TokenValue } from "./token-value";

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

export function ColourSection() {
  return (
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
  );
}
