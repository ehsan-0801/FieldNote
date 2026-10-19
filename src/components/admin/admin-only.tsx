import Link from "next/link";
import { LockIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "../ui/states";

/** Shown instead of an admin page; the data was never loaded. */
export function AdminOnly() {
  return (
    <div className="panel">
      <EmptyState
        icon={LockIcon}
        title="You can’t open this page with your current access."
        action={
          <Link href="/app" className="btn btn-secondary">
            Back to overview
          </Link>
        }
      >
        People, categories, AI providers and the full audit log are managed by workspace administrators.
      </EmptyState>
    </div>
  );
}
