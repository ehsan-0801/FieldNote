import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";

/** Keeps the current filters and changes only the page number. */
export function Pagination({
  basePath,
  searchParams,
  page,
  pageCount,
  total,
  pageSize,
  noun,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun: [singular: string, plural: string];
}) {
  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (value) params.set(key, value);
    params.set("page", String(target));
    return `${basePath}?${params.toString()}`;
  };
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-rule px-4 py-3 text-sm">
      <p className="text-ink-muted" aria-live="polite">
        {total === 0 ? `No ${noun[1]}` : `${first}–${last} of ${total} ${total === 1 ? noun[0] : noun[1]}`}
      </p>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="btn btn-secondary btn-sm" rel="prev">
            <CaretLeftIcon size={14} aria-hidden />
            Previous
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm opacity-50" aria-disabled="true">
            <CaretLeftIcon size={14} aria-hidden />
            Previous
          </span>
        )}
        <span className="px-1 font-mono text-xs text-ink-muted tabular-nums">
          {page}/{pageCount}
        </span>
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className="btn btn-secondary btn-sm" rel="next">
            Next
            <CaretRightIcon size={14} aria-hidden />
          </Link>
        ) : (
          <span className="btn btn-secondary btn-sm opacity-50" aria-disabled="true">
            Next
            <CaretRightIcon size={14} aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
