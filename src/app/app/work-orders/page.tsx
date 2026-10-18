import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { Role } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/page-header";
import { WorkOrderListView } from "@/components/work-orders/work-order-list-view";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Work orders" };

const DESCRIPTION: Record<Role, string> = {
  ADMIN: "Every work order in this workspace.",
  COORDINATOR: "Every work order in this workspace.",
  TECHNICIAN: "Work assigned to you, plus anything you reported yourself.",
  REPORTER: "The reports you have filed.",
};

export default async function WorkOrdersPage({ searchParams }: PageProps<"/app/work-orders">) {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader
        title="Work orders"
        description={DESCRIPTION[user.role]}
        actions={
          <Link href="/app/work-orders/new" className="btn btn-primary">
            <PlusIcon size={16} aria-hidden />
            New report
          </Link>
        }
      />
      <WorkOrderListView
        actor={user}
        basePath="/app/work-orders"
        rawSearchParams={await searchParams}
        emptyHint="Reports appear here as soon as they are filed."
      />
    </>
  );
}
