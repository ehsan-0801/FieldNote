"use client";

import { useState } from "react";
import { NotePencilIcon } from "@phosphor-icons/react/ssr";
import type { EditableDetailField } from "@/domain/access";
import { anyData } from "@/lib/api-client";
import { fieldError, useApiAction } from "@/lib/use-api-action";
import { InlineNotice } from "../ui/states";

interface Details {
  title: string;
  summary: string | null;
  categoryId: string | null;
  categoryName: string | null;
  locationLabel: string | null;
  assetLabel: string | null;
}

/** Structured details beside the immutable original report. Only fields the server allows are editable. */
export function DetailsEditor({
  workOrderId,
  details,
  editable,
  categories,
}: {
  workOrderId: string;
  details: Details;
  editable: readonly EditableDetailField[];
  categories: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(details);
  const [titleError, setTitleError] = useState<string | null>(null);
  const action = useApiAction();
  const can = (field: EditableDetailField) => editable.includes(field);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const body: Record<string, string | null> = {};
    for (const field of editable) {
      const next = values[field];
      if (next !== details[field]) body[field] = typeof next === "string" ? next.trim() || null : next;
    }
    if (body.title === null) {
      setTitleError("Give the work order a short title.");
      return;
    }
    setTitleError(null);
    if (Object.keys(body).length === 0) return setEditing(false);
    const result = await action.run(`/api/work-orders/${workOrderId}`, "PATCH", body, anyData);
    if (result.ok) setEditing(false);
  }

  if (!editing) {
    return (
      <div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="label-mono">Summary</dt>
            <dd className="mt-1 leading-relaxed">{details.summary ?? <span className="text-ink-muted">No summary yet.</span>}</dd>
          </div>
          <div>
            <dt className="label-mono">Category</dt>
            <dd className="mt-1">{details.categoryName ?? <span className="text-ink-muted">Uncategorised</span>}</dd>
          </div>
          <div>
            <dt className="label-mono">Location</dt>
            <dd className="mt-1">{details.locationLabel ?? <span className="text-ink-muted">Not given</span>}</dd>
          </div>
          <div>
            <dt className="label-mono">Asset</dt>
            <dd className="mt-1">{details.assetLabel ?? <span className="text-ink-muted">Not given</span>}</dd>
          </div>
        </dl>
        {editable.length > 0 ? (
          <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={() => (setValues(details), setEditing(true))}>
            <NotePencilIcon size={14} aria-hidden />
            Edit details
          </button>
        ) : null}
      </div>
    );
  }

  const set = (field: keyof Details) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((value) => ({ ...value, [field]: event.target.value }));

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
      {can("title") ? (
        <div className="sm:col-span-2">
          <label htmlFor="detail-title" className="field-label">
            Title
          </label>
          <input
            id="detail-title"
            className="input"
            value={values.title}
            onChange={set("title")}
            maxLength={100}
            required
            aria-invalid={Boolean(titleError ?? fieldError(action.error, "title"))}
          />
          {(titleError ?? fieldError(action.error, "title")) ? (
            <p className="field-error" role="alert">
              {titleError ?? fieldError(action.error, "title")}
            </p>
          ) : null}
        </div>
      ) : null}
      {can("summary") ? (
        <div className="sm:col-span-2">
          <label htmlFor="detail-summary" className="field-label">
            Summary
          </label>
          <textarea id="detail-summary" className="input" rows={3} value={values.summary ?? ""} onChange={set("summary")} maxLength={600} />
        </div>
      ) : null}
      {can("categoryId") ? (
        <div>
          <label htmlFor="detail-category" className="field-label">
            Category
          </label>
          <select id="detail-category" className="input" value={values.categoryId ?? ""} onChange={set("categoryId")}>
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {can("locationLabel") ? (
        <div>
          <label htmlFor="detail-location" className="field-label">
            Location
          </label>
          <input
            id="detail-location"
            className="input"
            value={values.locationLabel ?? ""}
            onChange={set("locationLabel")}
            maxLength={120}
          />
        </div>
      ) : null}
      {can("assetLabel") ? (
        <div>
          <label htmlFor="detail-asset" className="field-label">
            Asset
          </label>
          <input id="detail-asset" className="input" value={values.assetLabel ?? ""} onChange={set("assetLabel")} maxLength={120} />
        </div>
      ) : null}
      <div className="sm:col-span-2" aria-live="polite">
        {action.error && !fieldError(action.error, "title") ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save details"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={action.pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
