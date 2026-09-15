import { EmptyState } from "@/components/empty-state/empty-state";
import { AdminIcon } from "@/components/icons";

export const metadata = {
  title: "Commission Rules",
};

export default function CommissionRulesPage() {
  return (
    <EmptyState
      icon={<AdminIcon className="h-5 w-5" />}
      title="Commission rules are being configured."
      description="Plan structures and rate rules will be defined here. No commission formulas, GP calculations or payroll logic are implemented in this phase."
    />
  );
}
