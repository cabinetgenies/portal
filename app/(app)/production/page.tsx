import { EmptyState } from "@/components/empty-state/empty-state";
import { ProductionIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "Production",
};

export default function ProductionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Production"
        description="Shop floor workload, job status, and production scheduling."
      />
      <EmptyState
        icon={<ProductionIcon className="h-5 w-5" />}
        title="Production module coming soon"
        description="Scheduling and shop floor status will be built here in a later phase."
      />
    </div>
  );
}
