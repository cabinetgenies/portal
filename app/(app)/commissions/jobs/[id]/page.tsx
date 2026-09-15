import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { JobAdjustmentForm } from "@/components/commission/job-adjustment-form";
import {
  ChangeOrderCard,
  ChangeOrderCreateForm,
} from "@/components/commission/job-change-orders";
import { JobCommissionPanel } from "@/components/commission/job-commission-panel";
import { JobFinancialsForm } from "@/components/commission/job-financials-form";
import { JobOverviewForm } from "@/components/commission/job-forms";
import { JobCompensationPlanForm } from "@/components/commission/job-plan-form";
import { LiveCalculationPanel } from "@/components/commission/live-calculation-panel";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon, AlertIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import {
  type TierWindow,
} from "@/lib/compensation/plan-resolution";
import {
  listCompensationPlanOptions,
  listProjectCategories,
  listSalesDesignerOptions,
} from "@/lib/compensation/queries";
import {
  financialInputsFromJob,
  getJobDetail,
} from "@/lib/commission/queries";
import {
  getCommissionSettings,
  getJobCommissionContext,
  jobCostRateDefaults,
  settingsSnapshot,
} from "@/lib/commission/event-queries";
import { toNumber } from "@/lib/commission/financials";
import { changeOrderLabel, changeOrderTotalsFromRows } from "@/lib/commission/change-orders";
import { buildLiveCalculation } from "@/lib/commission/live-calculation";
import {
  ADJUSTMENT_TYPE_LABELS,
  isAdjustmentType,
  jobStatusLabel,
  jobStatusTone,
} from "@/lib/commission/types";
import type { ThresholdType } from "@/lib/compensation/types";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Job",
};

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#financials", label: "Financials" },
  { href: "#change-orders", label: "Change orders" },
  { href: "#commission", label: "Commission" },
  { href: "#commission-setup", label: "Commission setup" },
  { href: "#audit", label: "Events / history" },
];

export default async function JobDetailPage(props: PageProps<"/commissions/jobs/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const detail = await getJobDetail(id);

  if (!detail) {
    notFound();
  }

  const {
    job,
    category,
    designer,
    adjustments,
    changeOrders,
    auditEvents,
    plan,
    planVersion,
    planVersionTiers,
  } = detail;

  const canManageJobs = session.capabilities.includes("manage:jobs");
  const canEditFinancials = session.capabilities.includes("edit:job-financials");
  const canAdjust = session.capabilities.includes("create:job-adjustments");
  const canViewConfig = session.capabilities.includes("view:compensation-config");
  const canCalculate = session.capabilities.includes("calculate:commission");
  const canSubmit = session.capabilities.includes("submit:commission");
  const canApprove = session.capabilities.includes("approve:commission");
  const canPay = session.capabilities.includes("pay:commission");
  const canVoid = session.capabilities.includes("void:commission");

  const commissionContext = await getJobCommissionContext(id);
  const commissionSettings = await getCommissionSettings();
  const costRateDefaults = jobCostRateDefaults(commissionSettings);

  const activeChangeOrders = changeOrders.filter((changeOrder) => changeOrder.active);
  const removedChangeOrders = changeOrders.filter((changeOrder) => !changeOrder.active);
  const changeOrderRollUp = changeOrderTotalsFromRows(activeChangeOrders);
  const tierWindows = planVersionTiers.map<TierWindow>((tier) => ({
    sortOrder: tier.sort_order,
    label: tier.label,
    // numeric columns can arrive as strings; the band comparison must be numeric.
    rate: toNumber(tier.rate),
    lower: {
      thresholdType: tier.lower_threshold_type as ThresholdType,
      value: tier.lower_gp_percent === null ? null : toNumber(tier.lower_gp_percent),
    },
    upper: {
      thresholdType: tier.upper_threshold_type as ThresholdType,
      value: tier.upper_gp_percent === null ? null : toNumber(tier.upper_gp_percent),
    },
  }));

  // The live picture: stored original inputs plus the change order roll-up, run
  // through the same engine the new-job form uses. This is the estimate a deposit
  // is based on; the final true-up uses the finalized audit snapshot.
  const liveCalculation = buildLiveCalculation({
    inputs: {
      ...financialInputsFromJob(job, costRateDefaults),
      changeOrderRevenue: changeOrderRollUp.revenue,
      changeOrderCost: changeOrderRollUp.cost,
    },
    tiers: tierWindows,
    minimumGpStandard: toNumber(category?.minimum_gp_standard),
    settings: settingsSnapshot(commissionSettings),
    onDraw: commissionContext?.onDraw ?? false,
    previouslyRecognized: commissionContext?.previouslyRecognized ?? 0,
  });

  // Anything already approved or paid keeps the figures it was calculated with.
  const recognizedEvents = (commissionContext?.events ?? []).filter(
    (event) => event.status === "approved" || event.status === "paid",
  );
  const recognizedNetPayable = recognizedEvents.reduce(
    (total, event) => total + toNumber(event.net_payable),
    0,
  );

  const [categories, designers, planOptions] = await Promise.all([
    canManageJobs ? listProjectCategories() : Promise.resolve([]),
    canManageJobs ? listSalesDesignerOptions() : Promise.resolve([]),
    canViewConfig && canManageJobs ? listCompensationPlanOptions() : Promise.resolve([]),
  ]);

  // The affected band comes from the same calculation the Commission section uses,
  // so the detail page cannot disagree with the engine about which tier applies.
  const indicativeBand =
    canViewConfig && planVersion
      ? {
          label: liveCalculation.commission.tierLabel,
          rate: liveCalculation.commission.standardRate,
        }
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
        {recognizedEvents.length > 0 ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-3"
          >
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-accent-strong">
                These inputs do not rewrite what has already been recognized
              </p>
              <p className="text-sm leading-6 text-accent-strong">
                {recognizedEvents.length} approved or paid commission event
                {recognizedEvents.length === 1 ? "" : "s"} already exist for this job —
                {" "}
                {formatMoney(recognizedNetPayable)} net payable. They keep the figures,
                rates and plan version they were calculated with, so editing the inputs
                below changes the job&apos;s current financials only. Final reconciliation
                happens through the existing final true-up workflow, which recognizes the
                difference rather than amending history.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            {canEditFinancials ? (
              <JobFinancialsForm job={job} costRates={costRateDefaults} />
            ) : (
              <p className="text-sm leading-6 text-ink-muted">
                Your role can see this job&apos;s figures but not change them. Direct cost,
                burden, warranty contingency, total cost, gross profit and the commission
                estimate are all in the Live Calculation panel.
              </p>
            )}
          </div>
          <LiveCalculationPanel calculation={liveCalculation} />
        </div>
      </Panel>

      <Panel
        id="change-orders"
        title="Change orders"
        description="Each change order is its own record — number, name, revenue and cost. The job's change order totals are the roll-up of these rows, and change order cost sits inside direct cost before burden and warranty contingency are applied."
      >
        <div className="space-y-5">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            <ReadOnly
              label="Total change order revenue"
              value={formatMoney(changeOrderRollUp.revenue)}
            />
            <ReadOnly
              label="Total change order costs"
              value={formatMoney(changeOrderRollUp.cost)}
            />
            <ReadOnly
              label="Gross profit impact"
              value={formatMoney(changeOrderRollUp.grossProfit)}
            />
          </dl>

          {activeChangeOrders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
              No active change orders. Revenue and cost come from the original job only.
            </p>
          ) : (
            <ul className="space-y-3">
              {activeChangeOrders.map((changeOrder) => (
                <ChangeOrderCard
                  key={changeOrder.id}
                  jobId={job.id}
                  changeOrder={changeOrder}
                />
              ))}
            </ul>
          )}

          {canEditFinancials ? <ChangeOrderCreateForm jobId={job.id} /> : null}

          {removedChangeOrders.length > 0 ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                Removed change orders
              </h3>
              <ul className="space-y-1 text-xs text-ink-muted">
                {removedChangeOrders.map((changeOrder) => (
                  <li key={changeOrder.id}>
                    {changeOrderLabel(changeOrder)} · revenue{" "}
                    {formatMoney(changeOrder.revenue)} · cost{" "}
                    {formatMoney(changeOrder.cost)} · kept for history, excluded from the
                    totals above
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-xs leading-5 text-ink-subtle">
            Adding, editing or removing a change order updates the job&apos;s current
            financials only. A commission event already approved or paid keeps the figures it
            was calculated with; reconciliation happens through the final true-up.
          </p>
        </div>
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
              <JobCompensationPlanForm
                jobId={job.id}
                plans={planOptions}
                currentPlanId={job.compensation_plan_id}
                currentVersionId={job.compensation_plan_version_id}
                soldDate={job.sold_date}
              />
            ) : null}

            <p className="text-xs leading-5 text-ink-subtle">
              The band above matches this job&apos;s commissionable GP against the attached
              plan version. Commission is calculated from the Commission section below,
              which snapshots these rates and figures onto the event. Sales manager
              compensation is not implemented: a manager bonus is attributed to qualifying
              jobs separately, never as a share of this designer&apos;s commission.
            </p>
          </div>
        ) : (
          <EmptyState
            title="Commission plan details are restricted"
            description="Only accounting and administrators can see the plan and tiers attached to a job."
          />
        )}
      </Panel>

      {commissionContext ? (
        <JobCommissionPanel
          context={commissionContext}
          canCalculate={canCalculate}
          canViewConfig={canViewConfig}
          canSubmit={canSubmit}
          canApprove={canApprove}
          canPay={canPay}
          canVoid={canVoid}
        />
      ) : null}

      {canViewConfig ? (
        <Panel
          id="audit"
          title="Events and history"
          description="Financial adjustments and the job's audit trail. Adjustments are append-only: correcting a job means recording another adjustment, so the reason behind every change stays on the record. Commission events themselves are listed in the Commission section above."
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
    case "compensation_plan_assigned":
      return "Compensation plan assigned";
    // Historical rows written before the compensation rename.
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
