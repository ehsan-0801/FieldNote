import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ReportComposer } from "@/components/work-orders/report-composer";

export const metadata: Metadata = { title: "New report" };

export default function NewReportPage() {
  return (
    <>
      <PageHeader
        title="Report an issue"
        description="Write it down in plain words. The report is saved first; structure can be drafted from it and you review everything before it reaches triage."
      />
      <ReportComposer />
    </>
  );
}
