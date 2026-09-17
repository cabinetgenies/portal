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
import { formatDate, formatPercent } from "@/lib/utils/format";

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

  return (
    <div className="space-y-6">
      <Panel
        title="Commission setup"
        description="The compensation plan version governing this project. Sold projects keep the version they were sold under."
      >
        {canViewConfig ? (
          <div className="space-y-5">
            {plan && planVersion ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={`${plan.name} · ${planVersion.version_name}`} tone="info" />
                <span className="text-xs text-ink-muted">
                  Effective {formatDate(planVersion.effective_from)} → {planVersion.effective_to ? formatDate(planVersion.effective_to) : "open"}
                </span>
                {indicativeBand ? (
                  <span className="text-xs text-ink-muted">
                    Current band: {indicativeBand.label ?? "unnamed"} ({formatPercent(indicativeBand.rate)})
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-6 text-ink-muted">No compensation plan version is attached to this project yet.</p>
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
          </div>
        ) : (
          <EmptyState
            title="Commission plan details are restricted"
            description="Only authorized roles can see the plan and tiers attached to this project."
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
          hasFinalizedAudit={latestFinalized !== null}
        />
      ) : null}

      <Panel
        title="Final audit"
        description="Finalize the authoritative commission picture for this project after the financials are complete."
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
    </div>
  );
}
