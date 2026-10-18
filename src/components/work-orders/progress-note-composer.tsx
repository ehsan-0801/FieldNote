"use client";

import { useState } from "react";
import { NoteKind } from "@/generated/prisma/enums";
import { anyData } from "@/lib/api-client";
import { fieldError, useApiAction } from "@/lib/use-api-action";
import { InlineNotice } from "../ui/states";

export function ProgressNoteComposer({ workOrderId, kinds }: { workOrderId: string; kinds: NoteKind[] }) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<NoteKind>(kinds.includes(NoteKind.PROGRESS) ? NoteKind.PROGRESS : NoteKind.COMMENT);
  const [posted, setPosted] = useState(false);
  const action = useApiAction();

  if (kinds.length === 0) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPosted(false);
    const result = await action.run(`/api/work-orders/${workOrderId}/notes`, "POST", { body, kind }, anyData);
    if (result.ok) {
      setBody("");
      setPosted(true);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div>
        <label htmlFor="note-body" className="field-label">
          {kinds.includes(NoteKind.PROGRESS) ? "Add a note" : "Add a comment"}
        </label>
        <textarea
          id="note-body"
          className="input"
          rows={3}
          value={body}
          onChange={(event) => (setBody(event.target.value), setPosted(false))}
          maxLength={2000}
          aria-invalid={Boolean(fieldError(action.error, "body"))}
          placeholder={kinds.includes(NoteKind.PROGRESS) ? "What did you find or do?" : "Anything the team should know?"}
        />
        <p className="field-error">{fieldError(action.error, "body") ?? ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kinds.length > 1 ? (
          <div className="flex rounded-control border border-rule-strong p-0.5" role="radiogroup" aria-label="Note type">
            {kinds.map((option) => (
              <label
                key={option}
                className={`cursor-pointer rounded-[6px] px-2.5 py-1 text-[13px] ${kind === option ? "bg-ink text-chalk" : "text-ink-muted"}`}
              >
                <input
                  type="radio"
                  name="note-kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="sr-only"
                />
                {option === NoteKind.PROGRESS ? "Progress" : "Comment"}
              </label>
            ))}
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary ml-auto" disabled={action.pending || body.trim().length < 2}>
          {action.pending ? "Posting…" : "Post note"}
        </button>
      </div>
      <div aria-live="polite">
        {action.error && !fieldError(action.error, "body") ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}
        {posted ? <p className="text-xs text-signal">Note added to the timeline.</p> : null}
      </div>
    </form>
  );
}
