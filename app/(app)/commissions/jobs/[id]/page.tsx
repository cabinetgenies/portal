import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { JobAdjustmentForm } from "@/components/commission/job-adjustment-form";
import { JobFinancialsForm } from "@/components/commission/job-financials-form";
import { JobOverviewForm } from "@/components/commission/job-forms";
import { JobPlanAssignmentForm } from "@/components/commission/job-plan-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import {
  resolveTierForGpPercent,
  type TierWindow,
} from "@/lib/commission/plan-resolution";
import {
  getJobDetail,
  listDesignerOptions,
  listPlanSelectOptions,
  listProjectCategories,
} from "@/lib/commission/queries";
import {
  ADJUSTMENT_TYPE_LABELS,
  isAdjustmentType,
  jobStatusLabel,
  jobStatusTone,
  type JobAdjustmentInput,
  type ThresholdType,
} from "@/lib/commission/types";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Job",
};

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#financials", label: "Financials" },
  { href: "#commission-setup", label: "Commission setup" },
  { href: "#audit", label: "Audit / adjustments" },
];

export default async function JobDetailPage(props: PageProps<"/commissions/jobs/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const detail = await getJobDetail(id);

  if (!detail) {
    notFound();
  }

  const { job, category, designer, adjustments, auditEvents, plan, planVersion, planVersionTiers } =
    detail;

  const canManageJobs = session.capabilities.includes("manage:jobs");
  const canEditFinancials = session.capabilities.includes("edit:job-financials");
  const canAdjust = session.capabilities.includes("create:job-adjustments");
  const canViewConfig = session.capabilities.includes("view:commission-config");

  const [categories, designers, planOptions] = await Promise.all([
    canManageJobs ? listProjectCategories() : Promise.resolve([]),
    canManageJobs ? listDesignerOptions() : Promise.resolve([]),
    canViewConfig && canManageJobs ? listPlanSelectOptions() : Promise.resolve([]),
  ]);

  const adjustmentInputs: JobAdjustmentInput[] = adjustments.flatMap((adjustment) =>
    isAdjustmentType(adjustment.adjustment_type)
      ? [
          {
            adjustmentType: adjustment.adjustment_type,
            amount: Number(adjustment.amount),
          },
        ]
      : [],
  );

  const indicativeBand =
    canViewConfig && planVersion && category && planVersionTiers.length > 0
      ? resolveTierForGpPercent(
          planVersionTiers.map<TierWindow>((tier) => ({
            sortOrder: tier.sort_order,
            label: tier.label,
            rate: tier.rate,
            lower: {
              thresholdType: tier.lower_threshold_type as ThresholdType,
              value: tier.lower_gp_percent,
            },
            upper: {
              thresholdType: tier.upper_threshold_type as ThresholdType,
              value: tier.upper_gp_percent,
            },
          })),
          job.job_gp_percent,
          category.minimum_gp_standard,
        )
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={job.job_number ? `Job ${job.job_number}` : "Job"}
        title={job.job_name}
        description={
          category
            ? `${category.name} · minimum GP ${formatPercent(category.minimum_gp_standard)}`
            : "Project category unavailable"
        }
        actions={
          <Link
            href="/commissions/jobs"
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Back to jobs
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={jobStatusLabel(job.status)} tone={jobStatusTone(job.status)} />
        <span className="text-xs text-ink-muted">
          Sales designer: {formatText(designer ? designerDisplayName(designer) : null)}
        </span>
        <span className="text-xs text-ink-muted">Sold: {formatDate(job.sold_date)}</span>
      </div>

      <nav aria-label="Job sections" className="flex flex-wrap gap-2">
        {SECTIONS.filter(
          (section) => section.href !== "#audit" || canViewConfig,
        ).map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <section
        aria-label="Financial summary"
        className="grid gap-3 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Figure label="Revenue" value={formatMoney(job.actual_total_revenue)} />
        <Figure label="Cost" value={formatMoney(job.actual_total_cost)} />
        <Figure label="Job GP" value={formatMoney(job.job_gross_profit)} />
        <Figure label="Job GP %" value={formatPercent(job.job_gp_percent)} />
        <Figure
          label="Commissionable GP"
          value={formatMoney(job.commissionable_gross_profit)}
          hint={formatPercent(job.commissionable_gp_percent)}
        />
      </section>

      <Panel
        id="overview"
        title="Overview"
        description="Job identity, workflow status, milestone dates and the sales designer. Changes here are recorded in the audit trail."
      >
        {canManageJobs ? (
          <JobOverviewForm categories={categories} designers={designers} job={job} />
        ) : (
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <ReadOnly label="Job name" value={job.job_name} />
            <ReadOnly label="Job number" value={formatText(job.job_number)} />
            <ReadOnly label="Customer" value={formatText(job.customer_name)} />
            <ReadOnly label="Category" value={formatText(category?.name)} />
            <ReadOnly label="Status" value={jobStatusLabel(job.status)} />
            <ReadOnly
              label="Sales designer"
              value={formatText(designer ? designerDisplayName(designer) : null)}
            />
            <ReadOnly label="Sold" value={formatDate(job.sold_date)} />
            <ReadOnly label="Deposit received" value={formatDate(job.deposit_received_date)} />
            <ReadOnly label="Completed" value={formatDate(job.completion_date)} />
            <ReadOnly label="GP audit completed" value={formatDate(job.gp_audit_completed_date)} />
          </dl>
        )}
      </Panel>

      <Panel
        id="financials"
        title="Financials"
        description="Revenue and cost inputs. Total job revenue, total job cost, job gross profit and the commissionable figures are derived from these by the single shared calculation."
      >
        {canEditFinancials ? (
          <JobFinancialsForm job={job} adjustments={adjustmentInputs} />
        ) : (
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <ReadOnly label="Total job revenue" value={formatMoney(job.actual_total_revenue)} />
            <ReadOnly label="Total job cost" value={formatMoney(job.actual_total_cost)} />
            <ReadOnly label="Job gross profit" value={formatMoney(job.job_gross_profit)} />
            <ReadOnly label="Job GP %" value={formatPercent(job.job_gp_percent)} />
            <ReadOnly
              label="Commissionable GP"
              value={formatMoney(job.commissionable_gross_profit)}
            />
            <ReadOnly
              label="Commissionable GP %"
              value={formatPercent(job.commissionable_gp_percent)}
            />
          </dl>
        )}
      </Panel>

      <Panel
        id="commission-setup"
        title="Commission setup"
        description="The plan version that governs this job. Sold jobs keep the version they were sold under — a newer version never applies retroactively."
      >
        {canViewConfig ? (
          <div className="space-y-5">
            {plan && planVersion ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={`${plan.name} · ${planVersion.version_name}`} tone="info" />
                <span className="text-xs text-ink-muted">
                  Effective {formatDate(planVersion.effective_from)} →{" "}
                  {planVersion.effective_to ? formatDate(planVersion.effective_to) : "open"}
                </span>
                {indicativeBand ? (
                  <span className="text-xs text-ink-muted">
                    Job GP falls in band “{indicativeBand.label ?? "unnamed"}” (
                    {formatPercent(indicativeBand.rate)})
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-6 text-ink-muted">
                No commission plan version is attached to this job yet.
              </p>
            )}

            {canManageJobs ? (
              <JobPlanAssignmentForm
                jobId={job.id}
                plans={planOptions}
                currentPlanId={job.commission_plan_id}
                currentVersionId={job.commission_plan_version_id}
                soldDate={job.sold_date}
              />
            ) : null}

            <p className="text-xs leading-5 text-ink-subtle">
              Bands are shown for context only. This phase stores the rules and the job&apos;s
              financials; it does not calculate commission dollars.
            </p>
          </div>
        ) : (
          <EmptyState
            title="Commission plan details are restricted"
            description="Only accounting and administrators can see the plan and tiers attached to a job."
          />
        )}
      </Panel>

      {canViewConfig ? (
        <Panel
          id="audit"
          title="Audit / adjustments"
          description="Adjustments are append-only. Correcting a job means recording another adjustment, so the reason behind every change stays on the record."
        >
          <div className="space-y-6">
            {canAdjust ? <JobAdjustmentForm jobId={job.id} /> : null}

            {adjustments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
                No financial adjustments recorded. Commissionable gross profit currently
                equals job gross profit.
              </p>
            ) : (
              <TableWrap>
                <Table caption="Financial adjustments recorded against this job">
                  <thead>
                    <tr>
                      <Th>Recorded</Th>
                      <Th>Type</Th>
                      <Th className="text-right">Amount</Th>
                      <Th>Reason</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map((adjustment) => (
                      <tr key={adjustment.id}>
                        <Td className="text-ink-muted">
                          {formatDateTime(adjustment.created_at)}
                        </Td>
                        <Td>
                          {isAdjustmentType(adjustment.adjustment_type)
                            ? ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]
                            : adjustment.adjustment_type}
                        </Td>
                        <TdNumeric>{formatMoney(adjustment.amount)}</TdNumeric>
                        <Td className="text-ink-muted">{adjustment.reason}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}

            <div className="space-y-3">
              <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                Audit trail
              </h3>
              {auditEvents.length === 0 ? (
                <EmptyState
                  icon={<ActivityIcon className="h-5 w-5" />}
                  title="No audit events recorded yet."
                  description="Status changes, sales designer changes, category changes, plan assignment and financial edits are logged automatically."
                />
              ) : (
                <ul className="space-y-2">
                  {auditEvents.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-lg border border-line bg-surface-muted px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-ink">
                          {auditActionLabel(event.action)}
                        </span>
                        <span className="text-xs text-ink-subtle">
                          {formatDateTime(event.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-xs break-all text-ink-muted">
                        {JSON.stringify(event.metadata)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </p>
      <p className="font-mono text-sm tabular-nums text-ink">{value}</p>
      {hint ? <p className="font-mono text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: ReactNode }) {
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

function auditActionLabel(action: string) {
  switch (action) {
    case "job_created":
      return "Job created";
    case "job_status_changed":
      return "Status changed";
    case "sales_designer_changed":
      return "Sales designer changed";
    case "project_category_changed":
      return "Project category changed";
    case "commission_plan_assigned":
      return "Commission plan assigned";
    case "job_financials_changed":
      return "Financials changed";
    case "financial_adjustment_created":
      return "Financial adjustment recorded";
    default:
      return action.replaceAll("_", " ");
  }
}
