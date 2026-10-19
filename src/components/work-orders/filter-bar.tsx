"use client";

import { useState } from "react";
import Link from "next/link";
import { FunnelIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { Priority, WorkOrderStatus } from "@/generated/prisma/enums";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "@/domain/priority";
import { PAGE_SIZES, type WorkOrderListQuery } from "@/domain/schemas";
import { STATUS_LABEL } from "@/domain/workflow";
import { Dialog } from "../ui/dialog";

interface Option {
  id: string;
  name: string;
}

interface FilterBarProps {
  action: string;
  query: WorkOrderListQuery;
  categories: Option[];
  owners: Option[] | null;
  activeCount: number;
}

/**
 * Plain GET form, so filters live in the URL and work without JavaScript.
 * On small screens the same fields move into a bottom sheet.
 */
export function FilterBar({ action, query, categories, owners, activeCount }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const fields = (idPrefix: string) => (
    <>
      <div>
        <label htmlFor={`${idPrefix}-status`} className="field-label">
          Status
        </label>
        <select id={`${idPrefix}-status`} name="status" defaultValue={query.status ?? ""} className="input">
          <option value="">Any status except archived</option>
          {Object.values(WorkOrderStatus).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-priority`} className="field-label">
          Priority
        </label>
        <select id={`${idPrefix}-priority`} name="priority" defaultValue={query.priority ?? ""} className="input">
          <option value="">Any priority</option>
          {PRIORITY_ORDER.map((priority: Priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABEL[priority]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-category`} className="field-label">
          Category
        </label>
        <select id={`${idPrefix}-category`} name="category" defaultValue={query.category ?? ""} className="input">
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      {owners ? (
        <div>
          <label htmlFor={`${idPrefix}-owner`} className="field-label">
            Owner
          </label>
          <select id={`${idPrefix}-owner`} name="owner" defaultValue={query.owner ?? ""} className="input">
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label htmlFor={`${idPrefix}-sort`} className="field-label">
          Sort by
        </label>
        <select id={`${idPrefix}-sort`} name="sort" defaultValue={query.sort} className="input">
          <option value="updated">Last updated</option>
          <option value="priority">Priority</option>
          <option value="created">Date reported</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-dir`} className="field-label">
          Order
        </label>
        <select id={`${idPrefix}-dir`} name="dir" defaultValue={query.dir} className="input">
          <option value="desc">{query.sort === "priority" ? "Most urgent first" : "Newest first"}</option>
          <option value="asc">{query.sort === "priority" ? "Least urgent first" : "Oldest first"}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-size`} className="field-label">
          Per page
        </label>
        <select id={`${idPrefix}-size`} name="pageSize" defaultValue={String(query.pageSize)} className="input">
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
    </>
  );

  return (
    <form action={action} className="mb-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="filter-q" className="field-label">
            Search
          </label>
          <div className="relative">
            <MagnifyingGlassIcon
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              id="filter-q"
              name="q"
              type="search"
              defaultValue={query.q ?? ""}
              placeholder="Reference, title, place or report text"
              className="input pl-9"
            />
          </div>
        </div>
        <button type="button" className="btn btn-secondary md:hidden" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <FunnelIcon size={16} aria-hidden />
          Filters{activeCount ? ` (${activeCount})` : ""}
        </button>
        <button type="submit" className="btn btn-primary">
          Apply
        </button>
      </div>

      {/* Only one copy of the fields is enabled at a time, so each value is submitted once. */}
      <fieldset disabled={sheetOpen} className="mt-3 hidden grid-cols-4 items-end gap-3 md:grid xl:grid-cols-7">
        <legend className="sr-only">Filters</legend>
        {fields("desktop")}
      </fieldset>

      {activeCount > 0 ? (
        <p className="mt-2 text-xs text-ink-muted">
          {activeCount} filter{activeCount === 1 ? "" : "s"} applied ·{" "}
          <Link href={action} className="link">
            Clear filters
          </Link>
        </p>
      ) : null}

      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter work orders" placement="sheet">
        <fieldset disabled={!sheetOpen} className="grid gap-3">
          <legend className="sr-only">Filters</legend>
          {fields("sheet")}
        </fieldset>
        <div className="mt-5 flex justify-end gap-2">
          <Link href={action} className="btn btn-secondary">
            Clear
          </Link>
          <button type="submit" className="btn btn-primary">
            Show results
          </button>
        </div>
      </Dialog>
    </form>
  );
}
