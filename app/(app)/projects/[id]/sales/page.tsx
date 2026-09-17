import { notFound } from "next/navigation";

import { ChangeOrderCard, ChangeOrderCreateForm } from "@/components/commission/job-change-orders";
import { JobFinancialsForm } from "@/components/commission/job-financials-form";
import { LiveCalculationPanel } from "@/components/commission/live-calculation-panel";
import { AlertIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { financialInputsFromJob, getJobDetail } from "@/lib/commission/queries";
import {
  getCommissionSettings,
  getJobCommissionContext,
  jobCostRateDefaults,
  settingsSnapshot,
} from "@/lib/commission/event-queries";
import { changeOrderLabel, changeOrderTotalsFromRows } from "@/lib/commission/change-orders";
import { buildLiveCalculation } from "@/lib/commission/live-calculation";
import { tierWindowsFromRows } from "@/lib/commission/job-entry";
import { toNumber } from "@/lib/commission/financials";
import { formatMoney, formatPercent } from "@/lib/utils/format";

export const metadata = { title: "Project sales" };

export default async function ProjectSalesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const detail = await getJobDetail(id);
  if (!detail) notFound();

  const { job, changeOrders, planVersionTiers } = detail;
  const canEditFinancials = session.capabilities.includes("edit:job-financials");
  const commissionContext = await getJobCommissionContext(id);
  const commissionSettings = await getCommissionSettings();
  const costRateDefaults = jobCostRateDefaults(commissionSettings);
  const activeChangeOrders = changeOrders.filter((changeOrder) => changeOrder.active);
  const removedChangeOrders = changeOrders.filter((changeOrder) => !changeOrder.active);
  const changeOrderRollUp = changeOrderTotalsFromRows(activeChangeOrders);
  const jobInputs = financialInputsFromJob(job, costRateDefaults);
  const liveCalculation = buildLiveCalculation({
    inputs: {
      ...jobInputs,
      changeOrderRevenue: changeOrderRollUp.revenue,
      changeOrderCost: changeOrderRollUp.cost,
    },
    tiers: tierWindowsFromRows(planVersionTiers),
    minimumGpStandard: 0,
    settings: settingsSnapshot(commissionSettings),
    onDraw: commissionContext?.onDraw ?? false,
    previouslyRecognized: commissionContext?.previouslyRecognized ?? 0,
  });

  const recognizedEvents = (commissionContext?.events ?? []).filter(
    (event) => event.status === "approved" || event.status === "paid",
  );
  const recognizedNetPayable = recognizedEvents.reduce(
    (total, event) => total + toNumber(event.net_payable),
    0,
  );

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revenue" value={formatMoney(job.actual_total_revenue)} />
        <Metric label="Total cost" value={formatMoney(job.actual_total_cost)} />
        <Metric label="Gross profit" value={formatMoney(job.job_gross_profit)} />
        <Metric label="GP %" value={formatPercent(job.job_gp_percent)} emphasized />
      </section>

      {recognizedEvents.length > 0 ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-line bg-accent-soft px-4 py-3.5">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
          <div>
            <p className="text-sm font-medium text-accent-strong">Commission history already exists</p>
            <p className="mt-0.5 text-sm leading-6 text-accent-strong">
              {recognizedEvents.length} approved or paid event{recognizedEvents.length === 1 ? "" : "s"} total {formatMoney(recognizedNetPayable)} net payable. Editing current financials will not rewrite recognized commission history.
            </p>
          </div>
        </div>
      ) : null}

      <Panel
        title="Financial summary"
        description="The current project financials used by the commission engine."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Summary label="Original contract" value={formatMoney(jobInputs.contractRevenue)} />
          <Summary label="Original costs" value={formatMoney(jobInputs.originalCost)} />
          <Summary label="Change orders" value={`${formatMoney(changeOrderRollUp.revenue)} rev · ${formatMoney(changeOrderRollUp.cost)} cost`} />
          <Summary label="Burden" value={formatPercent(jobInputs.burdenPercent)} />
          <Summary label="Warranty / service" value={formatPercent(jobInputs.warrantyContingencyPercent)} />
          <Summary label="Direct cost" value={formatMoney(liveCalculation.cost.directJobCost)} />
        </div>

        {canEditFinancials ? (
          <details className="group rounded-xl border border-line bg-surface-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink">
              <span>Edit financial inputs</span>
              <span className="text-xs text-ink-subtle group-open:hidden">Open form</span>
              <span className="hidden text-xs text-ink-subtle group-open:inline">Close form</span>
            </summary>
            <div className="border-t border-line px-4 py-5">
              <JobFinancialsForm job={job} costRates={costRateDefaults} />
            </div>
          </details>
        ) : (
          <p className="text-sm leading-6 text-ink-muted">Your role can view these figures but cannot change them.</p>
        )}
      </Panel>

      <Panel
        title="Commission preview"
        description="The commission impact of the current project financials."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <PreviewCard label="Tier" value={liveCalculation.commission.tierLabel ?? "No matching tier"} />
          <PreviewCard label="Rate" value={formatPercent(liveCalculation.commission.effectiveRate)} />
          <PreviewCard label="Projected commission" value={formatMoney(liveCalculation.commission.projectedGrossCommission)} emphasized />
          <PreviewCard label="Remaining" value={formatMoney(liveCalculation.commission.estimatedRemaining)} emphasized />
        </div>

        <details className="group rounded-xl border border-line bg-surface-muted/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink">
            <span>View full calculation</span>
            <span className="text-xs text-ink-subtle group-open:hidden">Open details</span>
            <span className="hidden text-xs text-ink-subtle group-open:inline">Close details</span>
          </summary>
          <div className="border-t border-line p-4">
            <LiveCalculationPanel calculation={liveCalculation} sticky={false} title="Calculation detail" />
          </div>
        </details>
      </Panel>

      <Panel
        title="Commission change orders"
        description="Only change orders that affect commission need to be tracked here. Operational change orders stay in Buildertrend."
      >
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">
              {activeChangeOrders.length === 0
                ? "No commission change orders"
                : `${activeChangeOrders.length} active commission change order${activeChangeOrders.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Revenue impact {formatMoney(changeOrderRollUp.revenue)} · Cost impact {formatMoney(changeOrderRollUp.cost)}
            </p>
          </div>
        </div>

        {activeChangeOrders.length > 0 ? (
          <ul className="space-y-3">
            {activeChangeOrders.map((changeOrder) => (
              <ChangeOrderCard key={changeOrder.id} jobId={job.id} changeOrder={changeOrder} />
            ))}
          </ul>
        ) : null}

        {canEditFinancials ? (
          <details className="group rounded-xl border border-line bg-surface-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink">
              <span>Add commission change order</span>
              <span className="text-xs text-ink-subtle group-open:hidden">Open form</span>
              <span className="hidden text-xs text-ink-subtle group-open:inline">Close form</span>
            </summary>
            <div className="border-t border-line px-4 py-5">
              <ChangeOrderCreateForm jobId={job.id} />
            </div>
          </details>
        ) : null}

        {removedChangeOrders.length > 0 ? (
          <details className="rounded-xl border border-line bg-surface-muted/30 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              Removed change orders ({removedChangeOrders.length})
            </summary>
            <div className="mt-3 space-y-1 text-xs text-ink-muted">
              {removedChangeOrders.map((changeOrder) => (
                <p key={changeOrder.id}>{changeOrderLabel(changeOrder)} · removed from current totals</p>
              ))}
            </div>
          </details>
        ) : null}
      </Panel>
    </div>
  );
}

function Metric({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasized ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
      <p className="text-xs font-medium tracking-[0.1em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted/40 p-4">
      <dt className="text-xs font-medium tracking-[0.1em] text-ink-subtle uppercase">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function PreviewCard({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasized ? "border-accent/50 bg-accent-soft" : "border-line bg-surface-muted/40"}`}>
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</p>
      <p className={emphasized ? "mt-2 font-mono text-lg font-semibold tabular-nums text-ink" : "mt-2 text-sm font-semibold text-ink"}>
        {value}
      </p>
    </div>
  );
}
