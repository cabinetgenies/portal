import { EmptyState } from "@/components/empty-state/empty-state";
import { CommissionsIcon } from "@/components/icons";

export const metadata = {
  title: "Commissions",
};

export default function CommissionsPage() {
  return (
    <EmptyState
      icon={<CommissionsIcon className="h-5 w-5" />}
      title="Commission data is live; payouts are not."
      description="Jobs, project categories, commission plans and effective-dated versions are now real records. Payment calculation, the 50% deposit payout, true-up and payroll batching are the next phase and are deliberately not implemented yet."
    />
  );
}
