import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { Role } from "@/generated/prisma/enums";
import { LoadingState } from "@/components/ui/loading-state";
import { PageHeader } from "@/components/ui/page-header";
import { WorkOrderListView } from "@/components/work-orders/work-order-list-view";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Work orders" };

const SCOPE: Record<Role, string> = {
  ADMIN: "Showing every work order in this workspace.",
  COORDINATOR: "Showing every work order in this workspace.",
  TECHNICIAN: "Showing work assigned to you, plus anything you reported yourself.",
  REPORTER: "Showing the reports you have filed.",
};

export default function WorkOrdersPage({ searchParams }: PageProps<"/app/work-orders">) {
  return (
    <>
      <PageHeader
        title="Work orders"
        actions={
          <Link href="/app/work-orders/new" className="btn btn-primary">
            <PlusIcon size={16} aria-hidden />
            New report
          </Link>
        }
      />
      <Suspense fallback={<LoadingState label="Loading work orders…" />}>
        <WorkOrders searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function WorkOrders({ searchParams }: { searchParams: PageProps<"/app/work-orders">["searchParams"] }) {
  const user = await requirePageUser();
  return (
    <>
      <p className="-mt-2 mb-4 text-sm text-ink-muted">{SCOPE[user.role]}</p>
      <WorkOrderListView
        actor={user}
        basePath="/app/work-orders"
        rawSearchParams={await searchParams}
        emptyHint="Reports appear here as soon as they are filed."
      />
    </>
  );
}
