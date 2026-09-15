import { EmptyState } from "@/components/empty-state/empty-state";
import { ReportsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "Reports",
};

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Reports"
        description="Company reporting and exports across portal modules."
      />
      <EmptyState
        icon={<ReportsIcon className="h-5 w-5" />}
        title="Reports module coming soon"
        description="Reporting will be assembled once the commissions module is live and real data exists to report on."
      />
    </div>
  );
}
