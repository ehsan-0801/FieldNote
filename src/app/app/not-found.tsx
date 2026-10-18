import Link from "next/link";
import { LockIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="panel">
      <EmptyState
        icon={LockIcon}
        title="You can’t open this with your current access."
        action={
          <Link href="/app" className="btn btn-secondary">
            Back to overview
          </Link>
        }
      >
        It may not exist, or it may belong to someone else. Work orders are only visible to their reporter, the assigned technician and
        coordinators.
      </EmptyState>
    </div>
  );
}
