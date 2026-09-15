import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "Requests",
};

export default function RequestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portal"
        title="Requests"
        description="Internal requests and approvals."
      />
      <EmptyState
        icon={<ActivityIcon className="h-5 w-5" />}
        title="Requests is not built yet"
        description="Commission approval and payment requests are handled inside Commissions today. A general request queue will be built here in a later phase."
      />
    </div>
  );
}
