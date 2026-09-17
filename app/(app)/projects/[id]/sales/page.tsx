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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <Panel
          title="Financial summary"
          description="The current revenue and cost picture used for commission calculations."
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <Summary label="Original contract" value={formatMoney(jobInputs.contractRevenue)} />
            <Summary label="Original costs" value={formatMoney(jobInputs.originalCost)} />
            <Summary label="Change-order revenue" value={formatMoney(changeOrderRollUp.revenue)} />
            <Summary label="Change-order cost" value={formatMoney(changeOrderRollUp.cost)} />
            <Summary label="Burden" value={formatPercent(jobInputs.burdenPercent)} />
            <Summary label="Warranty / service" value={formatPercent(jobInputs.warrantyContingencyPercent)} />
          </dl>

          {canEditFinancials ? (
            <details className="group rounded-xl border border-line bg-surface-muted/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink">
                <span>Edit financial inputs</span>
                <span className="text-xs text-ink-subtle group-open:hidden">Open</span>
                <span className="hidden text-xs text-ink-subtle group-open:inline">Close</span>
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
          description="A quick read of the commission impact from the current financials."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <PreviewRow label="Applicable tier" value={liveCalculation.commission.tierLabel ?? "No matching tier"} />
            <PreviewRow label="Effective rate" value={formatPercent(liveCalculation.commission.effectiveRate)} />
            <PreviewRow label="Projected commission" value={formatMoney(liveCalculation.commission.projectedGrossCommission)} emphasized />
            <PreviewRow label="Estimated remaining" value={formatMoney(liveCalculation.commission.estimatedRemaining)} emphasized />
          </div>

          <details className="group rounded-xl border border-line bg-surface-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink">
              <span>View full calculation</span>
              <span className="text-xs text-ink-subtle group-open:hidden">Open</span>
              <span className="hidden text-xs text-ink-subtle group-open:inline">Close</span>
            </summary>
            <div className="border-t border-line p-3">
              <LiveCalculationPanel calculation={liveCalculation} sticky={false} title="Calculation detail" />
            </div>
          </details>
        </Panel>
      </div>

      <Panel
        title="Commission change orders"
        description="Only the financial impact needed for commission lives here. Operational change-order management stays in Buildertrend."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="Active change orders" value={String(activeChangeOrders.length)} />
          <Summary label="Revenue impact" value={formatMoney(changeOrderRollUp.revenue)} />
          <Summary label="Cost impact" value={formatMoney(changeOrderRollUp.cost)} />
        </div>

        {activeChangeOrders.length > 0 ? (
          <ul className="space-y-3">
            {activeChangeOrders.map((changeOrder) => (
              <ChangeOrderCard key={changeOrder.id} jobId={job.id} changeOrder={changeOrder} />
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted/20 px-4 py-6 text-center">
            <p className="text-sm font-medium text-ink">No commission change orders</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              Add one only when a change order affects the commission calculation.
            </p>
          </div>
        )}

        {canEditFinancials ? (
          <details className="group rounded-xl border border-line bg-surface-muted/30">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink">
              <span>Add change order</span>
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
      <dd className="mt-2 font-mono text-sm font-medium tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function PreviewRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-muted/40 px-4 py-3.5">
      <span className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</span>
      <span className={emphasized ? "font-mono text-base font-semibold tabular-nums text-ink" : "text-sm font-medium text-ink"}>
        {value}
      </span>
    </div>
  );
}
