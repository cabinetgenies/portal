import { EmptyState } from "@/components/empty-state/empty-state";
import { UsersIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "People",
};

export default function PeoplePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portal"
        title="People"
        description="The team, their roles and their reporting lines."
      />
      <EmptyState
        icon={<UsersIcon className="h-5 w-5" />}
        title="People is not built yet"
        description="Portal users, roles and reporting lines are managed under Admin → Users today. This module will hold the wider people view in a later phase."
      />
    </div>
  );
}
