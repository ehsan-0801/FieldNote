"use client";

import { useState } from "react";
import { WorkOrderStatus } from "@/generated/prisma/enums";
import { anyData } from "@/lib/api-client";
import { fieldError, useApiAction } from "@/lib/use-api-action";
import { Dialog } from "../ui/dialog";
import { InlineNotice } from "../ui/states";

export interface TransitionOption {
  to: WorkOrderStatus;
  label: string;
  requires: readonly ("resolutionNote" | "reason" | "assignee")[];
}

const DIALOG_COPY: Partial<Record<WorkOrderStatus, { title: string; description: string; confirm: string }>> = {
  RESOLVED: {
    title: "Resolve this work",
    description: "Describe what was done. The reporter will see this note.",
    confirm: "Resolve",
  },
  BLOCKED: {
    title: "Mark as blocked",
    description: "Say what this is waiting on, so the coordinator can unblock it.",
    confirm: "Mark blocked",
  },
  ARCHIVED: {
    title: "Archive this work order",
    description: "Archived work is hidden from lists but its history is kept.",
    confirm: "Archive",
  },
  CLOSED: { title: "Close this work order", description: "Closing confirms the resolution. It can no longer be edited.", confirm: "Close" },
  IN_PROGRESS: {
    title: "Reopen this work",
    description: "The resolution note is kept in the history. Explain what still needs doing.",
    confirm: "Reopen",
  },
};

/** One button per transition the server says is allowed; moves that need input or are final open a dialog. */
export function StatusTransitionMenu({
  workOrderId,
  current,
  options,
  hasAssignee,
}: {
  workOrderId: string;
  current: WorkOrderStatus;
  options: TransitionOption[];
  hasAssignee: boolean;
}) {
  const [active, setActive] = useState<TransitionOption | null>(null);
  const [text, setText] = useState("");
  const action = useApiAction();

  if (options.length === 0) return null;

  async function submit(option: TransitionOption, value?: string) {
    const body: Record<string, string> = { toStatus: option.to };
    if (option.requires.includes("resolutionNote")) body.resolutionNote = value ?? "";
    if (option.requires.includes("reason")) body.reason = value ?? "";
    const result = await action.run(`/api/work-orders/${workOrderId}/transition`, "POST", body, anyData);
    if (result.ok) {
      setActive(null);
      setText("");
    }
  }

  const needsDialog = (option: TransitionOption) =>
    option.requires.includes("resolutionNote") || option.requires.includes("reason") || option.to === WorkOrderStatus.CLOSED;
  const copy = active ? (DIALOG_COPY[active.to] ?? { title: active.label, description: "", confirm: active.label }) : null;
  const isReopen = active?.to === WorkOrderStatus.IN_PROGRESS && current === WorkOrderStatus.RESOLVED;
  const textField = active?.requires.includes("resolutionNote") ? "resolutionNote" : "reason";

  return (
    <div className="flex flex-wrap items-center gap-2 lg:max-w-md lg:justify-end">
      {options.map((option) => {
        const blockedByOwner = option.requires.includes("assignee") && !hasAssignee;
        const primary =
          option.to === WorkOrderStatus.RESOLVED || option.to === WorkOrderStatus.IN_PROGRESS || option.to === WorkOrderStatus.TRIAGE;
        return (
          <button
            key={option.to}
            type="button"
            className={`btn ${option.to === WorkOrderStatus.ARCHIVED ? "btn-ghost" : primary ? "btn-signal" : "btn-secondary"}`}
            disabled={action.pending || blockedByOwner}
            title={blockedByOwner ? "Assign an owner first" : undefined}
            onClick={() => (needsDialog(option) ? (action.clearError(), setActive(option)) : submit(option))}
          >
            {option.label}
          </button>
        );
      })}
      {options.some((option) => option.requires.includes("assignee")) && !hasAssignee ? (
        <p className="w-full text-xs text-ink-muted lg:text-right">Assign an owner before marking this ready or starting work.</p>
      ) : null}
      {action.error && !active ? (
        <div className="w-full">
          <InlineNotice tone="danger" live>
            {action.error.message}
          </InlineNotice>
        </div>
      ) : null}

      {active && copy ? (
        <Dialog open onClose={() => setActive(null)} title={isReopen ? "Reopen this work" : copy.title} description={copy.description}>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit(active, text);
            }}
          >
            {active.requires.includes("resolutionNote") || active.requires.includes("reason") ? (
              <div>
                <label htmlFor="transition-text" className="field-label">
                  {textField === "resolutionNote" ? "Resolution note" : "Reason"}
                </label>
                <textarea
                  id="transition-text"
                  className="input"
                  rows={textField === "resolutionNote" ? 4 : 3}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-invalid={Boolean(fieldError(action.error, textField))}
                  aria-describedby="transition-text-error"
                  maxLength={textField === "resolutionNote" ? 2000 : 500}
                />
                {fieldError(action.error, textField) ? (
                  <p id="transition-text-error" className="field-error" role="alert">
                    {fieldError(action.error, textField)}
                  </p>
                ) : null}
              </div>
            ) : null}
            {action.error && !fieldError(action.error, textField) ? (
              <InlineNotice tone="danger" live>
                {action.error.message}
              </InlineNotice>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setActive(null)} disabled={action.pending}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${active.to === WorkOrderStatus.ARCHIVED ? "btn-danger" : "btn-primary"}`}
                disabled={action.pending}
              >
                {action.pending ? "Saving…" : copy.confirm}
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}
