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

  return (
    <Panel
      title="Overview"
      description="The shared Cabinet Genies project record. Buildertrend remains the source of truth for project management and execution."
    >
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReadOnly label="Project name" value={job.job_name} />
        <ReadOnly label="Project number" value={formatText(job.job_number)} />
        <ReadOnly label="Customer" value={formatText(job.customer_name)} />
        <ReadOnly label="Status" value={jobStatusLabel(job.status)} />
        <ReadOnly
          label="Sales designer"
          value={formatText(designer ? designerDisplayName(designer) : null)}
        />
        <ReadOnly label="Sold date" value={formatDate(job.sold_date)} />
        <ReadOnly label="Created" value={formatDate(job.created_at)} />
        <ReadOnly label="Buildertrend" value="Managed in Buildertrend" />
      </dl>

      {canManageJobs ? (
        <div className="border-t border-line pt-5">
          <h3 className="pb-4 text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Edit project identity
          </h3>
          <JobOverviewForm designers={designers} job={job} />
        </div>
      ) : null}
    </Panel>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value}</dd>
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
