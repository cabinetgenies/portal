import { EmptyState } from "@/components/empty-state/empty-state";
import { ReportsIcon } from "@/components/icons";

export const metadata = {
  title: "Commission Reports",
};

export default function CommissionReportsPage() {
  return (
    <EmptyState
      icon={<ReportsIcon className="h-5 w-5" />}
      title="Commission reporting is being configured."
      description="Commission reporting will be built on top of the module's data, not ahead of it."
    />
  );
}
