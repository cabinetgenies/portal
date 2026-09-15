import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "Company",
};

export default function CompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portal"
        title="Company"
        description="Company-wide reference data and settings."
      />
      <EmptyState
        icon={<ProjectsIcon className="h-5 w-5" />}
        title="Company is not built yet"
        description="Company-level settings live under Admin for now. This module will hold reference data shared across the portal in a later phase."
      />
    </div>
  );
}
