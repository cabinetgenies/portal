import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";

export const metadata = {
  title: "Projects",
};

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Projects"
        description="Active jobs, milestones, and installation schedules."
      />
      <EmptyState
        icon={<ProjectsIcon className="h-5 w-5" />}
        title="Projects module coming soon"
        description="Job records and milestone tracking will be built here in a later phase."
      />
    </div>
  );
}
