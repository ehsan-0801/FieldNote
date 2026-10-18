import { Suspense } from "react";
import type { Metadata } from "next";
import { LoadingState } from "@/components/ui/loading-state";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { ActivityTimeline } from "@/components/work-orders/activity-timeline";
import { Pagination } from "@/components/work-orders/pagination";
import { requirePageUser } from "@/server/auth/session";
import { listActivity } from "@/server/audit-log";

export const metadata: Metadata = { title: "Activity" };

const SCOPE_NOTE: Record<Role, string> = {
  ADMIN: "Everything recorded in this workspace, including sign-ins and account changes.",
  COORDINATOR: "Every change to work orders and categories in this workspace.",
  TECHNICIAN: "History of the work orders assigned to you or reported by you.",
  REPORTER: "History of the reports you filed.",
};

const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

// Session-dependent content streams in behind its own boundary so client navigations stay instant.
export default function ActivityPage({ searchParams }: PageProps<"/app/activity">) {
  return (
    <Suspense fallback={<LoadingState label="Loading activity…" />}>
      <Activity searchParams={searchParams} />
    </Suspense>
  );
}

async function Activity({ searchParams }: { searchParams: PageProps<"/app/activity">["searchParams"] }) {
  const user = await requirePageUser();
  const { page: rawPage } = await searchParams;
  const page = pageSchema.parse(Array.isArray(rawPage) ? rawPage[0] : rawPage);
  const activity = await listActivity(user, page);

  return (
    <>
      <PageHeader title="Activity" description={SCOPE_NOTE[user.role]} />
      <section className="panel">
        <div className="px-4 py-5 sm:px-5">
          {activity.events.length ? (
            <ActivityTimeline events={activity.events} references={activity.references} />
          ) : (
            <EmptyState icon={ClockCounterClockwiseIcon} title="No activity to show yet.">
              Changes appear here as soon as someone files, assigns or updates work.
            </EmptyState>
          )}
        </div>
        <Pagination
          basePath="/app/activity"
          searchParams={{}}
          page={activity.page}
          pageCount={activity.pageCount}
          total={activity.total}
          pageSize={40}
          noun={["event", "events"]}
        />
      </section>
    </>
  );
}
