import { notFound } from "next/navigation";

import { FinalAuditPanel } from "@/components/commission/final-audit-panel";
import { JobCommissionPanel } from "@/components/commission/job-commission-panel";
import { JobCompensationPlanForm } from "@/components/commission/job-plan-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
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
import { formatDate, formatMoney, formatPercent } from "@/lib/utils/format";

export const metadata = { title: "Project commission" };

export default async function ProjectCommissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const planOptions = canViewConfig && canManageJobs ? await listCompensationPlanOptions() : [];
  const indicativeBand =
    canViewConfig && planVersion
      ? {
          label: liveCalculation.commission.tierLabel,
          rate: liveCalculation.commission.standardRate,
        }
      : null;
  const recognizedNetPayable = (commissionContext?.events ?? [])
    .filter((event) => event.status === "approved" || event.status === "paid")
    .reduce((total, event) => total + toNumber(event.net_payable), 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Commissionable GP" value={formatMoney(job.commissionable_gross_profit)} />
        <Metric label="Commissionable GP %" value={formatPercent(job.commissionable_gp_percent)} />
        <Metric
          label="Current rate"
          value={indicativeBand ? formatPercent(indicativeBand.rate) : "—"}
          emphasized
        />
        <Metric label="Recognized commission" value={formatMoney(recognizedNetPayable)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.75fr)_minmax(0,1.25fr)]">
        <Panel
          title="Commission setup"
          description="The plan and version attached to this project. Sold projects keep the version they were sold under."
          className="h-fit"
        >
          {canViewConfig ? (
            <div className="space-y-5">
              {plan && planVersion ? (
                <div className="space-y-3 rounded-xl border border-line bg-surface-muted/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={`${plan.name} · ${planVersion.version_name}`} tone="info" />
                    {indicativeBand ? (
                      <StatusBadge
                        label={`${indicativeBand.label ?? "Current tier"} · ${formatPercent(indicativeBand.rate)}`}
                        tone="positive"
                      />
                    ) : null}
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Summary label="Effective from" value={formatDate(planVersion.effective_from)} />
                    <Summary
                      label="Effective through"
                      value={planVersion.effective_to ? formatDate(planVersion.effective_to) : "Open"}
                    />
                  </dl>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-line-strong bg-surface-muted/30 p-5 text-sm text-ink-muted">
                  No compensation plan version is attached to this project yet.
                </div>
              )}

              {canManageJobs ? (
                <div className="border-t border-line pt-5">
                  <JobCompensationPlanForm
                    jobId={job.id}
                    plans={planOptions}
                    currentPlanId={job.compensation_plan_id}
                    currentVersionId={job.compensation_plan_version_id}
                    soldDate={job.sold_date}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="Commission plan details are restricted"
              description="Only authorized roles can see the plan and tiers attached to this project."
            />
          )}
        </Panel>

        <div className="space-y-5">
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
          ) : (
            <EmptyState
              title="Commission context unavailable"
              description="This project does not currently have commission context available for your role."
            />
          )}
        </div>
      </div>

      <Panel
        title="Final commission audit"
        description="Close the loop only after the project financials are complete. Finalizing snapshots the authoritative commission picture."
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Summary label="Audit state" value={auditState.replaceAll("_", " ")} />
          <Summary label="Audit revisions" value={String(audits.length)} />
          <Summary label="Blocking items" value={String(auditBlockers.length)} />
        </div>

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
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="mt-1 text-sm font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}
