import Link from "next/link";

import { JobOverviewForm } from "@/components/commission/job-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { AlertIcon, ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { listDesignerOptions, listProjectCategories } from "@/lib/commission/queries";

export const metadata = {
  title: "New job",
};

export default async function NewJobPage() {
  const session = await requireCapability("manage:jobs");

  if (!session.isAllowed) {
    return (
      <EmptyState
        title="Creating jobs is restricted"
        description="Jobs are created by administrators. Ask an administrator if you need a job added."
      />
    );
  }

  const [categories, designers] = await Promise.all([
    listProjectCategories(),
    listDesignerOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="New job"
        description="Job identity, category and sales designer. Revenue and cost are entered on the job itself, so the derived GP figures always come from one calculation."
        actions={
          <Link href="/commissions/jobs" className={buttonClassName({ variant: "secondary", size: "sm" })}>
            Back to jobs
          </Link>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="Add a project category first."
          description="Every job belongs to a project category, and the category carries the minimum GP standard commissions are measured against."
          action={
            <Link
              href="/admin/project-categories"
              className={buttonClassName({ size: "sm" })}
            >
              Configure project categories
            </Link>
          }
        />
      ) : (
        <>
          {designers.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <AlertIcon className="mt-0.5 h-4 w-4 text-ink-subtle" />
              <p className="text-sm leading-6 text-ink-muted">
                No active portal users are available as sales designers yet. The job can
                still be created and the designer assigned later.
              </p>
            </div>
          ) : null}
          <Panel
            id="job-create"
            title="Job details"
            description="Financials start at zero and are entered by accounting on the job's Financials section."
          >
            <JobOverviewForm categories={categories} designers={designers} />
          </Panel>
        </>
      )}
    </div>
  );
}
