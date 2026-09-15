import { EmptyState } from "@/components/empty-state/empty-state";
import { UsersIcon } from "@/components/icons";

export const metadata = {
  title: "Commission Employees",
};

export default function CommissionEmployeesPage() {
  return (
    <EmptyState
      icon={<UsersIcon className="h-5 w-5" />}
      title="Commission employee setup is being configured."
      description="Commission participation and plan assignment per employee will be managed here. Portal users and roles are managed in Admin → Users."
    />
  );
}
