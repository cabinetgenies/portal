import Link from "next/link";
import { notFound } from "next/navigation";

import { ChangeOrderCard, ChangeOrderCreateForm } from "@/components/commission/job-change-orders";
import { JobFinancialsForm } from "@/components/commission/job-financials-form";
import { AlertIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { financialInputsFromJob, getJobDetail } from "@/lib/commission/queries";
import {
  getCommissionSettings,
  getJobCommissionContext,
  jobCostRateDefaults,
  settingsSnapshot,
} from "@/lib/commission/event-queries";
import { changeOrderTotalsFromRows } from "@/lib/commission/change-orders";
import { buildLiveCalculation } from "@/lib/commission/live-calculation";
import { tierWindowsFromRows } from "@/lib/commission/job-entry";
import { toNumber } from "@/lib/commission/financials";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatMoney, formatPercent } from "@/lib/utils/format";

export const metadata = { title: "Project sales" };

export default async function ProjectSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; add?: string; co?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
  const selectedChangeOrder = query.co
    ? activeChangeOrders.find((changeOrder) => changeOrder.id === query.co) ?? null
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">Financial summary</h2>
        <p className="mt-1 text-sm text-ink-muted">The sales-side economics used by the commission engine.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Original contract price" value={formatMoney(jobInputs.contractRevenue)} />
        <Metric label="Total costs" value={formatMoney(liveCalculation.cost.totalCost)} />
        <Metric label="Gross profit" value={formatMoney(liveCalculation.profit.grossProfit)} />
        <Metric label="GP %" value={formatPercent(liveCalculation.profit.grossProfitPercent)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <Panel
          title="Pricing & cost details"
          description="The current financial inputs behind the project gross profit."
          actions={
            canEditFinancials ? (
              <Link
                href={`${PROJECT_ROUTES.sales(id)}?edit=financials`}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                Edit financials
              </Link>
            ) : null
          }
        >
          <dl className="divide-y divide-line">
            <Row label="Original contract price" value={formatMoney(liveCalculation.revenue.originalContractPrice)} />
            <Row label="Change order revenue" value={formatMoney(liveCalculation.revenue.changeOrderRevenue)} />
            <Row label="Total revenue" value={formatMoney(liveCalculation.revenue.totalRevenue)} strong />
            <Row label="Direct costs" value={formatMoney(liveCalculation.cost.originalCost)} />
            <Row label={`Burden (${formatPercent(liveCalculation.cost.burdenPercent)})`} value={formatMoney(liveCalculation.cost.burdenCost)} />
            <Row
              label={`Warranty / service contingency (${formatPercent(liveCalculation.cost.warrantyContingencyPercent)})`}
              value={formatMoney(liveCalculation.cost.warrantyServiceContingency)}
            />
            <Row label="Total costs" value={formatMoney(liveCalculation.cost.totalCost)} strong />
          </dl>

          {canEditFinancials && query.edit === "financials" ? (
            <div className="mt-5 border-t border-line pt-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">Edit financial inputs</p>
                <Link href={PROJECT_ROUTES.sales(id)} className="text-xs font-medium text-ink-muted hover:text-ink">Cancel</Link>
              </div>
              <JobFinancialsForm job={job} costRates={costRateDefaults} />
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Change orders"
          description="Only commission-impacting revenue and cost changes are tracked here."
          actions={
            canEditFinancials ? (
              <Link
                href={`${PROJECT_ROUTES.sales(id)}?add=change-order`}
                className={buttonClassName({ size: "sm" })}
              >
                Add change order
              </Link>
            ) : null
          }
        >
          {activeChangeOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink">No change orders yet</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">Add a change order to see its financial impact here.</p>
            </div>
          ) : (
            <TableWrap>
              <Table caption="Commission-impacting change orders">
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Description</Th>
                    <Th className="text-right">Revenue</Th>
                    <Th className="text-right">Costs</Th>
                    <Th className="text-right">GP</Th>
                    {canEditFinancials ? <Th><span className="sr-only">Edit</span></Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {activeChangeOrders.map((changeOrder) => (
                    <tr key={changeOrder.id}>
                      <Td className="text-ink-muted">{changeOrder.change_order_number ?? "—"}</Td>
                      <Td className="font-medium text-ink">{changeOrder.name}</Td>
                      <TdNumeric>{formatMoney(changeOrder.revenue)}</TdNumeric>
                      <TdNumeric>{formatMoney(changeOrder.cost)}</TdNumeric>
                      <TdNumeric>{formatMoney(changeOrder.revenue - changeOrder.cost)}</TdNumeric>
                      {canEditFinancials ? (
                        <Td>
                          <Link
                            href={`${PROJECT_ROUTES.sales(id)}?co=${changeOrder.id}`}
                            className="text-xs font-medium text-ink-muted hover:text-ink"
                          >
                            Edit
                          </Link>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}

          {canEditFinancials && query.add === "change-order" ? (
            <div className="border-t border-line pt-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Add change order</p>
                  <p className="mt-1 text-xs text-ink-muted">Record only the revenue and cost impact needed for commission.</p>
                </div>
                <Link href={PROJECT_ROUTES.sales(id)} className="text-xs font-medium text-ink-muted hover:text-ink">Cancel</Link>
              </div>
              <ChangeOrderCreateForm jobId={job.id} />
            </div>
          ) : null}

          {selectedChangeOrder ? (
            <div className="border-t border-line pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">Edit change order</p>
                <Link href={PROJECT_ROUTES.sales(id)} className="text-xs font-medium text-ink-muted hover:text-ink">Close</Link>
              </div>
              <ul><ChangeOrderCard jobId={job.id} changeOrder={selectedChangeOrder} /></ul>
            </div>
          ) : null}

          {removedChangeOrders.length > 0 ? (
            <p className="text-xs text-ink-subtle">{removedChangeOrders.length} removed change order{removedChangeOrders.length === 1 ? "" : "s"} are retained in project history.</p>
          ) : null}
        </Panel>
      </div>

      {recognizedEvents.length > 0 ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-line bg-accent-soft px-4 py-3.5">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
          <p className="text-sm leading-6 text-accent-strong">
            {recognizedEvents.length} approved or paid commission event{recognizedEvents.length === 1 ? "" : "s"} already exist ({formatMoney(recognizedNetPayable)} net payable). Editing current financials does not rewrite recognized commission history.
          </p>
        </div>
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

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className={strong ? "text-sm font-semibold text-ink" : "text-sm text-ink-muted"}>{label}</dt>
      <dd className={strong ? "text-sm font-semibold tabular-nums text-ink" : "text-sm tabular-nums text-ink"}>{value}</dd>
    </div>
  );
}
