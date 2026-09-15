import { EmptyState } from "@/components/empty-state/empty-state";
import { CommissionsIcon } from "@/components/icons";

export const metadata = {
  title: "Commission Payments",
};

export default function CommissionPaymentsPage() {
  return (
    <EmptyState
      icon={<CommissionsIcon className="h-5 w-5" />}
      title="Commission payments are being configured."
      description="Calculated, approved and paid commission records will be reconciled here once the calculation engine exists."
    />
  );
}
