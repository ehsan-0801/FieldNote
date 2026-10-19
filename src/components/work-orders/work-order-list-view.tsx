import Link from "next/link";
import { ClipboardTextIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import type { Actor } from "@/domain/access";
import { workOrderListQuerySchema, type WorkOrderListQuery } from "@/domain/schemas";
import { listFilterOptions, listWorkOrders } from "@/server/work-orders/queries";
import { EmptyState, InlineNotice } from "../ui/states";
import { FilterBar } from "./filter-bar";
import { Pagination } from "./pagination";
import { WorkOrderTable } from "./work-order-table";

const FILTER_KEYS = ["q", "status", "priority", "category", "owner"] as const;

/** Shared by /app/work-orders and /app/my-work; `fixed` filters are applied server-side and not editable. */
export async function WorkOrderListView({
  actor,
  basePath,
  rawSearchParams,
  fixed = {},
  emptyHint,
}: {
  actor: Actor;
  basePath: string;
  rawSearchParams: Record<string, string | string[] | undefined>;
  fixed?: Partial<WorkOrderListQuery>;
  emptyHint: string;
}) {
  const parsed = workOrderListQuerySchema.safeParse(rawSearchParams);
  const query: WorkOrderListQuery = { ...(parsed.success ? parsed.data : workOrderListQuerySchema.parse({})), ...fixed };
  const [result, options] = await Promise.all([listWorkOrders(actor, query), listFilterOptions(actor)]);
  const activeCount = FILTER_KEYS.filter((key) => query[key] !== undefined && fixed[key] === undefined).length;
  const now = new Date();

  return (
    <>
      <FilterBar
        // Remount when the URL's filters change (e.g. "Clear filters"), since selects only read defaultValue once.
        key={JSON.stringify(query)}
        action={basePath}
        query={query}
        categories={options.categories}
        owners={fixed.owner ? null : options.owners}
        activeCount={activeCount}
      />
      {!parsed.success ? (
        <div className="mb-4">
          <InlineNotice tone="warning">Some filters in the address weren’t recognised and were ignored.</InlineNotice>
        </div>
      ) : null}
      <section className="panel overflow-hidden" aria-label="Results">
        {result.items.length === 0 ? (
          <EmptyState
            icon={ClipboardTextIcon}
            title={activeCount ? "No work orders match these filters." : "Nothing here yet."}
            action={
              activeCount ? (
                <Link href={basePath} className="btn btn-secondary">
                  Clear filters
                </Link>
              ) : (
                <Link href="/app/work-orders/new" className="btn btn-primary">
                  <PlusIcon size={16} aria-hidden />
                  New report
                </Link>
              )
            }
          >
            {activeCount ? "Try a broader search, or clear the filters to see everything you have access to." : emptyHint}
          </EmptyState>
        ) : (
          <WorkOrderTable items={result.items} now={now} />
        )}
        <Pagination
          basePath={basePath}
          searchParams={{
            q: query.q,
            status: query.status,
            priority: query.priority,
            category: query.category,
            owner: fixed.owner ? undefined : query.owner,
            sort: query.sort,
            dir: query.dir,
            pageSize: String(query.pageSize),
          }}
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          pageSize={result.pageSize}
          noun={["work order", "work orders"]}
        />
      </section>
    </>
  );
}
