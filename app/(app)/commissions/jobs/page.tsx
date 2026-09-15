import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";

export const metadata = {
  title: "Commission Jobs",
};

export default function CommissionJobsPage() {
  return (
    <EmptyState
      icon={<ProjectsIcon className="h-5 w-5" />}
      title="Commission jobs are being configured."
      description="Job records that drive commission calculations will be listed here once the commission module is built."
    />
  );
}
