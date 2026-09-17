import Link from "next/link";
import { notFound } from "next/navigation";

import { JobOverviewForm } from "@/components/commission/job-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectTeam } from "@/components/projects/project-team";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { listSalesDesignerOptions } from "@/lib/compensation/queries";
import { getJobDetail } from "@/lib/commission/queries";
import { jobStatusLabel } from "@/lib/commission/types";
import { listProjectTeam, listProjectTeamOptions } from "@/lib/projects/team";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = { title: "Project overview" };

export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const detail = await getJobDetail(id);

  if (!detail) notFound();

  const { job, designer, auditEvents } = detail;
  const canManageJobs = session.capabilities.includes("manage:jobs");
  const canViewHistory = session.capabilities.includes("view:compensation-config");
  const [designers, projectTeam, teamOptions] = await Promise.all([
    canManageJobs && query.edit === "1" ? listSalesDesignerOptions() : Promise.resolve([]),
    listProjectTeam(id),
    canManageJobs ? listProjectTeamOptions() : Promise.resolve([]),
  ]);
  const designerName = formatText(designer ? designerDisplayName(designer) : null, "Unassigned");
  const recentActivity = canViewHistory ? auditEvents.slice(0, 4) : [];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total revenue" value={formatMoney(job.actual_total_revenue)} />
        <Metric label="Total costs" value={formatMoney(job.actual_total_cost)} />
        <Metric label="Gross profit" value={formatMoney(job.job_gross_profit)} />
        <Metric label="GP %" value={formatPercent(job.job_gp_percent)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,.7fr)_minmax(260px,.55fr)]">
        <Panel
          title="Project details"
          description="The shared project identity used by Cabinet Genies modules outside Buildertrend."
        >
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Fact label="Customer" value={formatText(job.customer_name)} />
            <Fact label="Project number" value={formatText(job.job_number)} />
            <Fact label="Status" value={jobStatusLabel(job.status)} />
            <Fact label="Sales designer" value={designerName} />
            <Fact label="Sold date" value={formatDate(job.sold_date)} />
            <Fact label="Created" value={formatDate(job.created_at)} />
          </dl>
        </Panel>

        <Panel title="Project team" description="People connected to this project in the BOS.">
          <ProjectTeam
            jobId={job.id}
            members={projectTeam}
            options={teamOptions}
            canEdit={canManageJobs}
            salesDesignerId={job.sales_designer_id}
            salesDesignerName={designerName}
          />
        </Panel>

        <div className="space-y-5">
          <Panel title="Buildertrend" description="Project execution stays in Buildertrend.">
            <div className="space-y-3 text-sm leading-6 text-ink-muted">
              <p>Scheduling, selections, field activity, service, and project management remain in Buildertrend.</p>
              <p className="text-xs text-ink-subtle">This portal holds only the project context Buildertrend cannot provide to the BOS.</p>
            </div>
          </Panel>

          <Panel title="Project status" description="High-level context only.">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-ink">{jobStatusLabel(job.status)}</p>
              <p className="text-xs leading-5 text-ink-muted">
                Sold {formatDate(job.sold_date)} · Designer {designerName}
              </p>
            </div>
          </Panel>
        </div>
      </div>

      {canViewHistory ? (
        <Panel
          title="Recent activity"
          description="The latest recorded changes to this project."
          actions={
            <Link
              href={PROJECT_ROUTES.history(id)}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              View all
            </Link>
          }
        >
          {recentActivity.length === 0 ? (
            <EmptyState title="No activity yet" description="Project changes will appear here as they are recorded." />
          ) : (
            <ul className="divide-y divide-line">
              {recentActivity.map((event) => (
                <li key={event.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink">{auditActionLabel(event.action)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{auditMetadataSummary(event.metadata)}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-subtle">{formatDateTime(event.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {canManageJobs && query.edit === "1" ? (
        <Panel
          title="Edit project"
          description="Update the shared identity fields used by connected BOS modules."
          actions={
            <Link
              href={PROJECT_ROUTES.project(id)}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              Cancel
            </Link>
          }
        >
          <JobOverviewForm designers={designers} job={job} />
        </Panel>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-ink">{value}</dd>
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

function auditActionLabel(action: string) {
  switch (action) {
    case "job_created": return "Project created";
    case "job_status_changed": return "Status changed";
    case "sales_designer_changed": return "Sales designer changed";
    case "compensation_plan_assigned": return "Compensation plan assigned";
    case "commission_plan_assigned": return "Commission plan assigned";
    case "job_financials_changed": return "Financials updated";
    case "financial_adjustment_created": return "Financial adjustment recorded";
    case "commission_event_created": return "Commission event created";
    case "commission_event_status_changed": return "Commission event updated";
    default: return action.replaceAll("_", " ");
  }
}

function auditMetadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "Recorded project activity";
  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 2)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);
  return entries.length > 0 ? entries.join(" · ") : "Recorded project activity";
}
