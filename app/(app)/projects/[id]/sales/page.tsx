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
    <div className="space-y-6">
      <Panel
        title="Sales financials"
        description="Revenue and cost inputs for this project. These are the figures the commission engine reads; project execution stays in Buildertrend."
      >
        {recognizedEvents.length > 0 ? (
          <div role="status" className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-3">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
            <p className="text-sm leading-6 text-accent-strong">
              {recognizedEvents.length} approved or paid commission event{recognizedEvents.length === 1 ? "" : "s"} already exist ({formatMoney(recognizedNetPayable)} net payable). Editing current inputs does not rewrite that history.
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <dl className="mb-6 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <ReadOnly label="Original contract price" value={formatMoney(jobInputs.contractRevenue)} />
              <ReadOnly label="Original costs" value={formatMoney(jobInputs.originalCost)} />
              <ReadOnly label="Change order revenue" value={formatMoney(changeOrderRollUp.revenue)} />
              <ReadOnly label="Change order cost" value={formatMoney(changeOrderRollUp.cost)} />
              <ReadOnly label="Total revenue" value={formatMoney(job.actual_total_revenue)} />
              <ReadOnly label="Total cost" value={formatMoney(job.actual_total_cost)} />
              <ReadOnly label="Gross profit" value={formatMoney(job.job_gross_profit)} />
              <ReadOnly label="GP %" value={formatPercent(job.job_gp_percent)} />
            </dl>
            {canEditFinancials ? (
              <JobFinancialsForm job={job} costRates={costRateDefaults} />
            ) : (
              <p className="text-sm leading-6 text-ink-muted">Your role can view these figures but cannot change them.</p>
            )}
          </div>
          <LiveCalculationPanel calculation={liveCalculation} />
        </div>
      </Panel>

      <Panel
        title="Change orders"
        description="Financial change-order records used by the commission calculation. Buildertrend remains the operational change-order system."
      >
        <div className="space-y-5">
          {activeChangeOrders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">No active change orders.</p>
          ) : (
            <ul className="space-y-3">
              {activeChangeOrders.map((changeOrder) => (
                <ChangeOrderCard key={changeOrder.id} jobId={job.id} changeOrder={changeOrder} />
              ))}
            </ul>
          )}
          {canEditFinancials ? <ChangeOrderCreateForm jobId={job.id} /> : null}
          {removedChangeOrders.length > 0 ? (
            <div className="border-t border-line pt-4 text-xs text-ink-muted">
              {removedChangeOrders.map((changeOrder) => (
                <p key={changeOrder.id}>{changeOrderLabel(changeOrder)} · removed from current totals</p>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}
