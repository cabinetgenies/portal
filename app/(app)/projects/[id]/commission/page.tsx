import Link from "next/link";
import { notFound } from "next/navigation";

import { FinalAuditPanel } from "@/components/commission/final-audit-panel";
import { JobCommissionPanel } from "@/components/commission/job-commission-panel";
import { JobCompensationPlanForm } from "@/components/commission/job-plan-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { listCompensationPlanOptions } from "@/lib/compensation/queries";
import { auditReadiness, deriveFinalAuditState } from "@/lib/commission/audit";
import { listJobAudits } from "@/lib/commission/audit-queries";
import { changeOrderTotalsFromRows } from "@/lib/commission/change-orders";
import {
  getCommissionSettings,
  getJobCommissionContext,
  jobCostRateDefaults,
  settingsSnapshot,
} from "@/lib/commission/event-queries";
import { toNumber } from "@/lib/commission/financials";
import { buildLiveCalculation } from "@/lib/commission/live-calculation";
import { financialInputsFromJob, getJobDetail } from "@/lib/commission/queries";
import { tierWindowsFromRows } from "@/lib/commission/job-entry";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatMoney, formatPercent } from "@/lib/utils/format";

export const metadata = { title: "Project commission" };

export default async function ProjectCommissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; audit?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const detail = await getJobDetail(id);
  if (!detail) notFound();

  const { job, changeOrders, plan, planVersion, planVersionTiers } = detail;
  const canManageJobs = session.capabilities.includes("manage:jobs");
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

  const audits = await listJobAudits(id);
  const finalTrueUpEvent = (commissionContext?.events ?? []).find(
    (event) => event.event_type === "final_true_up",
  );
  const auditState = deriveFinalAuditState({
    audits,
    finalEventStatus: finalTrueUpEvent?.status ?? null,
  });
  const openAudit = audits.find((audit) => audit.status === "in_review") ?? null;
  const latestFinalized = audits.find((audit) => audit.status === "finalized") ?? null;
  const auditBlockers = auditReadiness({
    calculation: liveCalculation,
    hasPlanVersion: planVersion !== null,
  });
  const planOptions =
    canViewConfig && canManageJobs && query.edit === "plan"
      ? await listCompensationPlanOptions()
      : [];
  const recognizedNetPayable = (commissionContext?.events ?? [])
    .filter((event) => event.status === "approved" || event.status === "paid")
    .reduce((total, event) => total + toNumber(event.net_payable), 0);
  const paidToDate = (commissionContext?.events ?? [])
    .filter((event) => event.status === "paid")
    .reduce((total, event) => total + toNumber(event.net_payable), 0);
  const projectedCommission = liveCalculation.commission.projectedGrossCommission;
  const remainingCommission = liveCalculation.commission.estimatedRemaining;
  const auditReady = auditBlockers.length === 0 && planVersion !== null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-ink">Commission summary</h2>
        <p className="mt-1 text-sm text-ink-muted">Plan, payout, and final-audit status for this project.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Commissionable GP" value={formatMoney(job.commissionable_gross_profit)} />
        <Metric label="Effective rate" value={formatPercent(liveCalculation.commission.effectiveRate)} />
        <Metric label="Projected commission" value={formatMoney(projectedCommission)} emphasized />
        <Metric label="Recognized commission" value={formatMoney(recognizedNetPayable)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel
          title="Commission plan"
          description="The plan version locked to this project's sold date."
          actions={
            canManageJobs && canViewConfig ? (
              <Link
                href={`${PROJECT_ROUTES.commission(id)}?edit=plan`}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                Edit
              </Link>
            ) : null
          }
        >
          {canViewConfig ? (
            plan && planVersion ? (
              <dl className="space-y-3">
                <InfoRow label="Plan" value={plan.name} />
                <InfoRow label="Plan version" value={planVersion.version_name} />
                <InfoRow label="Applicable tier" value={liveCalculation.commission.tierLabel ?? "No matching tier"} />
                <InfoRow label="Standard rate" value={formatPercent(liveCalculation.commission.standardRate)} />
                <InfoRow label="Effective rate" value={formatPercent(liveCalculation.commission.effectiveRate)} />
                <InfoRow label="Effective from" value={formatDate(planVersion.effective_from)} />
              </dl>
            ) : (
              <EmptyState title="No plan version attached" description="Attach the version that covered the project's sold date before calculating commission." />
            )
          ) : (
            <EmptyState title="Commission plan restricted" description="Your role cannot view compensation plan configuration." />
          )}
        </Panel>

        <Panel title="Payout preview" description="A simple view of the current projected payout.">
          <dl className="space-y-3">
            <InfoRow label="Projected commission" value={formatMoney(projectedCommission)} strong />
            <InfoRow label="Paid to date" value={formatMoney(paidToDate)} />
            <InfoRow label="Recognized total" value={formatMoney(recognizedNetPayable)} />
            <InfoRow label="Estimated remaining" value={formatMoney(remainingCommission)} strong />
            <InfoRow label="Deposit target" value={formatMoney(liveCalculation.commission.depositTarget)} />
          </dl>
          <div className="rounded-lg border border-line bg-surface-muted/40 px-3 py-2.5 text-xs leading-5 text-ink-muted">
            This is a live estimate from the current project financials. Final payout is based on the finalized audit snapshot.
          </div>
        </Panel>

        <Panel
          title="Audit readiness"
          description="What remains before the final commission can be closed."
          actions={
            canCalculate ? (
              <Link
                href={`${PROJECT_ROUTES.commission(id)}?audit=1`}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                Open final audit
              </Link>
            ) : null
          }
        >
          <ul className="space-y-3">
            <Readiness ok={planVersion !== null} label="Commission plan version attached" />
            <Readiness ok={auditBlockers.length === 0} label="Financial audit checks clear" />
            <Readiness ok={activeChangeOrders.length === 0} label="No active commission change orders" />
            <Readiness ok={latestFinalized !== null} label="Final audit completed" />
          </ul>
          <div className={`rounded-lg border px-3 py-2.5 text-xs leading-5 ${auditReady ? "border-line bg-accent-soft text-accent-strong" : "border-line bg-surface-muted/40 text-ink-muted"}`}>
            {latestFinalized
              ? "The final audit has been completed."
              : auditReady
                ? "The project is ready to begin the final commission audit."
                : `${auditBlockers.length} blocking item${auditBlockers.length === 1 ? "" : "s"} remain before finalization.`}
          </div>
        </Panel>
      </div>

      {canViewConfig && canManageJobs && query.edit === "plan" ? (
        <Panel
          title="Edit commission plan"
          description="Attach the compensation plan version that governs this project."
          actions={
            <Link href={PROJECT_ROUTES.commission(id)} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Cancel
            </Link>
          }
        >
          <JobCompensationPlanForm
            jobId={job.id}
            plans={planOptions}
            currentPlanId={job.compensation_plan_id}
            currentVersionId={job.compensation_plan_version_id}
            soldDate={job.sold_date}
          />
        </Panel>
      ) : null}

      {commissionContext ? (
        <JobCommissionPanel
          context={commissionContext}
          canCalculate={canCalculate}
          canViewConfig={canViewConfig}
          canSubmit={canSubmit}
          canApprove={canApprove}
          canPay={canPay}
          canVoid={canVoid}
          hasFinalizedAudit={latestFinalized !== null}
        />
      ) : null}

      {canCalculate && query.audit === "1" ? (
        <Panel
          title="Final commission audit"
          description="Review and finalize the authoritative commission snapshot."
          actions={
            <Link href={PROJECT_ROUTES.commission(id)} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Close audit
            </Link>
          }
        >
          <FinalAuditPanel
            jobId={job.id}
            state={auditState}
            audits={audits}
            openAudit={openAudit}
            latestFinalized={latestFinalized}
            calculation={liveCalculation}
            changeOrders={changeOrders}
            blockers={auditBlockers}
            canManageAudit={canCalculate}
            trueUp={
              finalTrueUpEvent
                ? {
                    status: finalTrueUpEvent.status,
                    netPayable: toNumber(finalTrueUpEvent.net_payable),
                  }
                : null
            }
          />
        </Panel>
      ) : null}
    </div>
  );
}

function Metric({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasized ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={strong ? "text-right font-mono text-sm font-semibold tabular-nums text-ink" : "text-right text-sm font-medium text-ink"}>{value}</dd>
    </div>
  );
}

function Readiness({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-ink">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${ok ? "bg-accent-soft text-accent-strong" : "bg-surface-muted text-ink-subtle"}`}>
        {ok ? "✓" : "·"}
      </span>
      <span>{label}</span>
    </li>
  );
}
