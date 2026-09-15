import { EmptyState } from "@/components/empty-state/empty-state";
import { SalesIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "Sales",
};

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Sales"
        description="Pipeline, estimates, and closed business across the Cabinet Genies sales team."
      />
      <EmptyState
        icon={<SalesIcon className="h-5 w-5" />}
        title="Sales module coming soon"
        description="Opportunity tracking, estimates and closed-business reporting will be built here in a later phase."
      />
    </div>
  );
}
