import { EmptyState } from "@/components/empty-state/empty-state";
import { CommissionsIcon } from "@/components/icons";

export const metadata = {
  title: "Commissions",
};

export default function CommissionsPage() {
  return (
    <EmptyState
      icon={<CommissionsIcon className="h-5 w-5" />}
      title="Commission tracking is being configured."
      description="The commission module is the first major build after this foundation. Jobs, employees, payments, rules and reports will come online together — no calculation logic runs yet."
    />
  );
}
