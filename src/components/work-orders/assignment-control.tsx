"use client";

import { useState } from "react";
import { UserCircleIcon } from "@phosphor-icons/react/ssr";
import { anyData } from "@/lib/api-client";
import { useApiAction } from "@/lib/use-api-action";
import { InlineNotice } from "../ui/states";

export function AssignmentControl({
  workOrderId,
  assignee,
  technicians,
  canAssign,
}: {
  workOrderId: string;
  assignee: { id: string; name: string } | null;
  technicians: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const [selected, setSelected] = useState(assignee?.id ?? "");
  const action = useApiAction();
  const [saved, setSaved] = useState(false);

  const current = (
    <p className="flex items-center gap-2 text-sm">
      <UserCircleIcon size={18} className="text-ink-muted" aria-hidden />
      {assignee ? <span className="font-medium">{assignee.name}</span> : <span className="text-amber-ink italic">No owner yet</span>}
    </p>
  );
  if (!canAssign) return current;

  async function save() {
    setSaved(false);
    const result = await action.run(`/api/work-orders/${workOrderId}`, "PATCH", { assigneeId: selected || null }, anyData);
    if (result.ok) setSaved(true);
  }

  return (
    <div className="space-y-2.5">
      {current}
      {technicians.length === 0 ? (
        <InlineNotice tone="warning">There are no active technicians to assign. An administrator can add one under People.</InlineNotice>
      ) : (
        <div className="flex gap-2">
          <label htmlFor="assignee" className="sr-only">
            Owner
          </label>
          <select id="assignee" className="input" value={selected} onChange={(event) => (setSelected(event.target.value), setSaved(false))}>
            <option value="">Unassigned</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={save} disabled={action.pending || selected === (assignee?.id ?? "")}>
            {action.pending ? "Saving…" : "Assign"}
          </button>
        </div>
      )}
      <div aria-live="polite">
        {action.error ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}
        {saved && !action.error ? <p className="text-xs text-signal">Owner updated.</p> : null}
      </div>
    </div>
  );
}
