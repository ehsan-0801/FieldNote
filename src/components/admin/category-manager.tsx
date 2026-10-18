"use client";

import { useState } from "react";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { anyData } from "@/lib/api-client";
import { fieldError, useApiAction } from "@/lib/use-api-action";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";
import { InlineNotice } from "../ui/states";

export interface ManagedCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  workOrderCount: number;
}

function CategoryRow({ category }: { category: ManagedCategory }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [confirming, setConfirming] = useState(false);
  const action = useApiAction();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await action.run(`/api/admin/categories/${category.id}`, "PATCH", { name, description: description || null }, anyData);
    if (result.ok) setEditing(false);
  }

  return (
    <li className="px-4 py-3.5">
      {editing ? (
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-start">
          <div>
            <label htmlFor={`cat-name-${category.id}`} className="sr-only">
              Name
            </label>
            <input
              id={`cat-name-${category.id}`}
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
            />
            <p className="field-error">{fieldError(action.error, "name") ?? ""}</p>
          </div>
          <div>
            <label htmlFor={`cat-desc-${category.id}`} className="sr-only">
              Description
            </label>
            <input
              id={`cat-desc-${category.id}`}
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
              placeholder="What belongs here"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={action.pending}>
              Save
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-medium ${category.isActive ? "" : "text-ink-muted line-through"}`}>{category.name}</p>
            <p className="text-xs text-ink-muted">
              {category.description ?? "No description"} · <span className="font-mono">{category.workOrderCount} work orders</span>
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            Rename
          </button>
          <button
            type="button"
            className={`btn btn-sm ${category.isActive ? "btn-ghost" : "btn-secondary"}`}
            onClick={() => setConfirming(true)}
          >
            {category.isActive ? "Retire" : "Restore"}
          </button>
        </div>
      )}
      {action.error && !fieldError(action.error, "name") ? (
        <div className="mt-2">
          <InlineNotice tone="danger">{action.error.message}</InlineNotice>
        </div>
      ) : null}
      <ConfirmActionDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={category.isActive ? `Retire “${category.name}”?` : `Restore “${category.name}”?`}
        description={
          category.isActive
            ? "It won’t be offered for new reports or AI suggestions. Existing work orders keep the label."
            : "It will be offered again for new reports and suggestions."
        }
        confirmLabel={category.isActive ? "Retire" : "Restore"}
        onConfirm={async () => {
          const result = await action.run(`/api/admin/categories/${category.id}`, "PATCH", { isActive: !category.isActive }, anyData);
          return result.ok ? null : result.error.message;
        }}
      />
    </li>
  );
}

export function CategoryManager({ categories }: { categories: ManagedCategory[] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const action = useApiAction();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const result = await action.run("/api/admin/categories", "POST", { name, ...(description ? { description } : {}) }, anyData);
    if (result.ok) {
      setName("");
      setDescription("");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel" aria-label="Categories">
        <ul className="divide-y divide-rule">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      </section>
      <section className="panel self-start" aria-labelledby="new-category-heading">
        <div className="panel-head">
          <h2 id="new-category-heading" className="panel-title">
            Add a category
          </h2>
        </div>
        <form onSubmit={create} className="grid gap-3 px-4 py-4" noValidate>
          <div>
            <label htmlFor="new-category-name" className="field-label">
              Name
            </label>
            <input
              id="new-category-name"
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              aria-invalid={Boolean(fieldError(action.error, "name"))}
            />
            <p className="field-error">{fieldError(action.error, "name") ?? ""}</p>
          </div>
          <div>
            <label htmlFor="new-category-description" className="field-label">
              Description <span className="font-normal text-ink-muted">(optional)</span>
            </label>
            <input
              id="new-category-description"
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={200}
            />
          </div>
          <div aria-live="polite">
            {action.error && !fieldError(action.error, "name") ? <InlineNotice tone="danger">{action.error.message}</InlineNotice> : null}
          </div>
          <button type="submit" className="btn btn-primary" disabled={action.pending || name.trim().length < 2}>
            <PlusIcon size={16} aria-hidden />
            Add category
          </button>
        </form>
      </section>
    </div>
  );
}
