import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/ui/loading-state";
import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/page-header";
import { InlineNotice } from "@/components/ui/states";
import { WorkOrderListView } from "@/components/work-orders/work-order-list-view";
import { requirePageUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "My work" };

// Session-dependent content streams in behind its own boundary so client navigations stay instant.
export default function MyWorkPage({ searchParams }: PageProps<"/app/my-work">) {
  return (
    <Suspense fallback={<LoadingState label="Loading your work…" />}>
      <MyWork searchParams={searchParams} />
    </Suspense>
  );
}

async function MyWork({ searchParams }: { searchParams: PageProps<"/app/my-work">["searchParams"] }) {
  const user = await requirePageUser();
  const params = await searchParams;

  if (user.role === Role.REPORTER) {
    return (
      <>
        <PageHeader title="My reports" description="Everything you have reported and where it stands." />
        <WorkOrderListView
          actor={user}
          basePath="/app/my-work"
          rawSearchParams={params}
          emptyHint="When you report an issue it will appear here with its status."
        />
      </>
    );
  }

  if (user.role !== Role.TECHNICIAN) {
    return (
      <>
        <PageHeader title="My work" />
        <InlineNotice title="Coordinators and administrators aren’t assigned work directly.">
          Use{" "}
          <Link href="/app/work-orders?owner=unassigned" className="link">
            unassigned work orders
          </Link>{" "}
          to find work that needs an owner.
        </InlineNotice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My work" description="Work orders currently assigned to you." />
      <WorkOrderListView
        actor={user}
        basePath="/app/my-work"
        rawSearchParams={params}
        fixed={{ owner: "me" }}
        emptyHint="Nothing is assigned to you right now. New assignments appear here."
      />
    </>
  );
}
