import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { toNumber } from "@/lib/commission/financials";
import {
  loadCommissionWorkspace,
  projectedCommissionForJob,
} from "@/lib/commission/event-queries";
import { jobStatusLabel, jobStatusTone } from "@/lib/commission/types";
import { formatDate, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Jobs",
};

function designerName(profile: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
} | null) {
  if (!profile) return null;

  const combined = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  return combined || profile.display_name || profile.email || null;
}

/**
 * The commission job list.
 *
 * Laid out as one card per job rather than a wide table: the figures a job needs
 * for commission and audit do not fit a table without horizontal scrolling, and
 * side-scrolling a financial list is unreadable. Every value wraps in place.
 */
export default async function CommissionJobsPage() {
  const session = await requireSession();
  const canManageJobs = session.capabilities.includes("manage:jobs");
  const canEditFinancials = session.capabilities.includes("edit:job-financials");
  const workspace = await loadCommissionWorkspace();

  const profilesById = new Map(workspace.profiles.map((profile) => [profile.id, profile]));
  const planById = new Map(workspace.plans.map((plan) => [plan.id, plan]));
  const versionById = new Map(
    workspace.planVersions.map((version) => [version.id, version]),
  );

  const jobs = workspace.jobs;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Jobs"
        description="Every job with the financial structure commission is calculated from. Rows are limited to the jobs your role can see."
        actions={
          canManageJobs ? (
            <Link href="/sales/commissions/jobs/new" className={buttonClassName({ size: "sm" })}>
              New job
            </Link>
          ) : null
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="No jobs yet."
          description={
            canManageJobs
              ? "Create the first job to start building the commission data set. No demo records are generated for you."
              : "Jobs appear here once they are created and assigned to you."
          }
          action={
            canManageJobs ? (
              <Link href="/sales/commissions/jobs/new" className={buttonClassName({ size: "sm" })}>
                Create a job
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-4">
          {jobs.map((job) => {
            const designer = job.sales_designer_id
              ? profilesById.get(job.sales_designer_id) ?? null
              : null;
            const plan = job.compensation_plan_id
              ? planById.get(job.compensation_plan_id) ?? null
              : null;
            const planVersion = job.compensation_plan_version_id
              ? versionById.get(job.compensation_plan_version_id) ?? null
              : null;
            const projection = projectedCommissionForJob(workspace, job);

            return (
              <li
                key={job.id}
                className="space-y-4 rounded-xl border border-line bg-surface p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/sales/commissions/jobs/${job.id}`}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {job.job_name}
                      </Link>
                      <StatusBadge
                        label={jobStatusLabel(job.status)}
                        tone={jobStatusTone(job.status)}
                      />
                      {job.job_number ? (
                        <span className="text-xs text-ink-subtle">{job.job_number}</span>
                      ) : null}
                    </div>
                    <p className="text-sm text-ink-muted">
                      {formatText(job.customer_name)}
                      {designer ? ` · ${designerName(designer)}` : " · No sales designer"}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/sales/commissions/jobs/${job.id}`}
                      className={buttonClassName({ variant: "secondary", size: "sm" })}
                    >
                      View job
                    </Link>
                    {canManageJobs || canEditFinancials ? (
                      <Link
                        href={`/sales/commissions/jobs/${job.id}#overview`}
                        className={buttonClassName({ variant: "ghost", size: "sm" })}
                      >
                        Edit job
                      </Link>
                    ) : null}
                  </div>
                </div>

                <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  <Figure
                    label="Total revenue"
                    value={formatMoney(toNumber(job.actual_total_revenue))}
                  />
                  <Figure
                    label="Total cost"
                    value={formatMoney(toNumber(job.actual_total_cost))}
                  />
                  <Figure
                    label="Commissionable GP"
                    value={formatMoney(toNumber(job.commissionable_gross_profit))}
                  />
                  <Figure
                    label="GP %"
                    value={`${formatPercent(toNumber(job.job_gp_percent))} job · ${formatPercent(
                      toNumber(job.commissionable_gp_percent),
                    )} commissionable`}
                  />
                  <Figure
                    label="Deposit"
                    value={
                      job.deposit_received_date
                        ? `Received ${formatDate(job.deposit_received_date)}`
                        : "Not received"
                    }
                    tone={job.deposit_received_date ? "default" : "muted"}
                  />
                  <Figure
                    label="GP audit"
                    value={
                      job.gp_audit_completed_date
                        ? `Audited ${formatDate(job.gp_audit_completed_date)}`
                        : "Not audited"
                    }
                    tone={job.gp_audit_completed_date ? "default" : "muted"}
                  />
                  <Figure
                    label="Compensation plan"
                    value={
                      plan
                        ? `${plan.name}${planVersion ? ` · ${planVersion.version_name}` : ""}`
                        : "No plan attached"
                    }
                    tone={plan ? "default" : "muted"}
                  />
                  <Figure
                    label="Projected commission"
                    value={
                      projection ? formatMoney(projection.jobGrossCommission) : "Not available"
                    }
                    hint={
                      projection
                        ? `Deposit target ${formatMoney(projection.grossCommission)}`
                        : "Needs a plan version with tiers"
                    }
                    tone={projection ? "default" : "muted"}
                  />
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs leading-5 text-ink-subtle">
        Gross profit and commissionable gross profit are separate figures. Commissionable gross
        profit equals job gross profit until explicit exclusions are recorded as adjustments.
        Projected commission uses the plan version attached to the job; it is a projection
        until a commission event is created from the job&apos;s Commission section.
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "muted";
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd
        className={
          tone === "muted"
            ? "text-sm break-words text-ink-muted"
            : "text-sm break-words text-ink"
        }
      >
        {value}
      </dd>
      {hint ? <p className="text-xs break-words text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
