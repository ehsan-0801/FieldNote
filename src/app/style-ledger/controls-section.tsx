import { SparkleIcon } from "@phosphor-icons/react/ssr";
import { DialogDemo } from "./dialog-demo";
import { Section } from "./section";

export function ControlsSection() {
  return (
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
  );
}
