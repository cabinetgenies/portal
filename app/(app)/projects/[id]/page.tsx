import Link from "next/link";
import { notFound } from "next/navigation";

import { JobOverviewForm } from "@/components/commission/job-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { listSalesDesignerOptions } from "@/lib/compensation/queries";
import { getJobDetail } from "@/lib/commission/queries";
import { jobStatusLabel } from "@/lib/commission/types";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatDateTime, formatText } from "@/lib/utils/format";

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
  const designers = canManageJobs && query.edit === "1" ? await listSalesDesignerOptions() : [];
  const designerName = formatText(designer ? designerDisplayName(designer) : null, "Unassigned");
  const recentActivity = canViewHistory ? auditEvents.slice(0, 4) : [];

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Status" value={jobStatusLabel(job.status)} />
        <Metric label="Project number" value={formatText(job.job_number)} />
        <Metric label="Sales designer" value={designerName} />
        <Metric label="Sold date" value={formatDate(job.sold_date)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <Panel
          title="Project details"
          description="The shared project identity used by Cabinet Genies modules outside Buildertrend."
          actions={
            canManageJobs ? (
              <Link
                href={`${PROJECT_ROUTES.project(id)}?edit=1`}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                Edit project
              </Link>
            ) : null
          }
        >
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <Fact label="Customer" value={formatText(job.customer_name)} />
            <Fact label="Project name" value={job.job_name} />
            <Fact label="Project number" value={formatText(job.job_number)} />
            <Fact label="Status" value={jobStatusLabel(job.status)} />
            <Fact label="Sales designer" value={designerName} />
            <Fact label="Sold date" value={formatDate(job.sold_date)} />
            <Fact label="Created" value={formatDate(job.created_at)} />
          </dl>
        </Panel>

        <div className="space-y-5">
          <Panel title="Project owner" description="Primary sales ownership for this project.">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-ink">
                {initials(designerName)}
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{designerName}</p>
                <p className="text-xs text-ink-muted">Sales designer</p>
              </div>
            </div>
          </Panel>

          <Panel title="Buildertrend" description="Project execution stays in Buildertrend.">
            <div className="space-y-2 text-sm leading-6 text-ink-muted">
              <p>Scheduling, selections, field activity, service, and project management remain outside this portal.</p>
              <p className="text-xs text-ink-subtle">This record exists so commissions, forms, and other BOS modules can reference the same project.</p>
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
              View history
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
      <p className="mt-2 truncate text-base font-semibold text-ink">{value}</p>
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

function initials(value: string) {
  const parts = value.split(/\s|@/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "—";
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
