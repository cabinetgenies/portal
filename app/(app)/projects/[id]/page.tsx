import { notFound } from "next/navigation";

import { JobOverviewForm } from "@/components/commission/job-forms";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { listSalesDesignerOptions } from "@/lib/compensation/queries";
import { getJobDetail } from "@/lib/commission/queries";
import { jobStatusLabel } from "@/lib/commission/types";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Project overview",
};

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const detail = await getJobDetail(id);

  if (!detail) notFound();

  const { job, designer } = detail;
  const canManageJobs = session.capabilities.includes("manage:jobs");
  const designers = canManageJobs ? await listSalesDesignerOptions() : [];

  const facts = [
    { label: "Project number", value: formatText(job.job_number) },
    { label: "Customer", value: formatText(job.customer_name) },
    { label: "Status", value: jobStatusLabel(job.status) },
    {
      label: "Sales designer",
      value: formatText(designer ? designerDisplayName(designer) : null),
    },
    { label: "Sold date", value: formatDate(job.sold_date) },
    { label: "Created", value: formatDate(job.created_at) },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
      <Panel
        title="Project details"
        description="The shared Cabinet Genies record used by sales, commission and other BOS modules."
        className="h-fit"
      >
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label} className="rounded-xl border border-line bg-surface-muted/45 p-4">
              <dt className="text-xs font-medium tracking-[0.1em] text-ink-subtle uppercase">
                {fact.label}
              </dt>
              <dd className="mt-2 text-sm font-medium text-ink">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <div className="rounded-xl border border-line bg-surface-muted/35 p-4">
          <p className="text-xs font-medium tracking-[0.1em] text-ink-subtle uppercase">Project management</p>
          <p className="mt-2 text-sm font-medium text-ink">Buildertrend</p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Scheduling, selections, field activity and project execution remain in Buildertrend. This portal only stores the project context Cabinet Genies needs outside Buildertrend.
          </p>
        </div>
      </Panel>

      <Panel
        title="Edit project"
        description={
          canManageJobs
            ? "Keep the shared project identity accurate for every connected module."
            : "Project identity is managed by authorized users."
        }
        className="h-fit"
      >
        {canManageJobs ? (
          <JobOverviewForm designers={designers} job={job} />
        ) : (
          <p className="text-sm leading-6 text-ink-muted">
            You can view this project record, but your role cannot edit its shared identity fields.
          </p>
        )}
      </Panel>
    </div>
  );
}

function designerDisplayName(designer: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) {
  const combined = [designer.first_name, designer.last_name].filter(Boolean).join(" ");
  return combined || designer.display_name || designer.email || "—";
}
