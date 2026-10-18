import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ReportComposer } from "@/components/work-orders/report-composer";
import { requirePageUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "New report" };

export default async function NewReportPage() {
  const user = await requirePageUser();
  const categories = await db.category.findMany({
    where: { workspaceId: user.workspaceId, isActive: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeader
        title="Report an issue"
        description="Write it down in plain words. The report is saved first; structure can be drafted from it and you review everything before it reaches triage."
      />
      <ReportComposer categories={categories} />
    </>
  );
}
