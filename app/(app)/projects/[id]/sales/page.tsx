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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.55fr)]">
        <Panel
          title="Financial inputs"
          description="Maintain the revenue and cost inputs used by the commission calculation."
          className="h-fit"
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <Summary label="Original contract" value={formatMoney(jobInputs.contractRevenue)} />
            <Summary label="Original costs" value={formatMoney(jobInputs.originalCost)} />
            <Summary label="Change-order revenue" value={formatMoney(changeOrderRollUp.revenue)} />
            <Summary label="Change-order cost" value={formatMoney(changeOrderRollUp.cost)} />
          </dl>

          <div className="border-t border-line pt-5">
            {canEditFinancials ? (
              <JobFinancialsForm job={job} costRates={costRateDefaults} />
            ) : (
              <p className="text-sm leading-6 text-ink-muted">Your role can view these figures but cannot change them.</p>
            )}
          </div>
        </Panel>

        <div className="h-fit xl:sticky xl:top-6">
          <LiveCalculationPanel calculation={liveCalculation} />
        </div>
      </div>

      <Panel
        title="Commission change orders"
        description="Only the financial impact needed for commission lives here. Operational change-order management stays in Buildertrend."
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Summary label="Active change orders" value={String(activeChangeOrders.length)} />
          <Summary label="Revenue impact" value={formatMoney(changeOrderRollUp.revenue)} />
          <Summary label="Cost impact" value={formatMoney(changeOrderRollUp.cost)} />
        </div>

        <div className="space-y-5">
          {activeChangeOrders.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted/30 px-4 py-8 text-center text-sm text-ink-muted">No active financial change orders.</p>
          ) : (
            <ul className="space-y-3">
              {activeChangeOrders.map((changeOrder) => (
                <ChangeOrderCard key={changeOrder.id} jobId={job.id} changeOrder={changeOrder} />
              ))}
            </ul>
          )}

          {canEditFinancials ? <ChangeOrderCreateForm jobId={job.id} /> : null}

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
        </div>
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
