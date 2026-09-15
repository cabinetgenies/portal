"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import {
  auditReadiness,
  buildFinalAuditSnapshot,
  nextAuditRevision,
} from "@/lib/commission/audit";
import { listJobAudits } from "@/lib/commission/audit-queries";
import { changeOrderTotalsFromRows } from "@/lib/commission/change-orders";
import {
  getCommissionSettings,
  getJobCommissionContext,
  jobCostRateDefaults,
  settingsSnapshot,
} from "@/lib/commission/event-queries";
import { toNumber } from "@/lib/commission/financials";
import { tierWindowsFromRows } from "@/lib/commission/job-entry";
import { buildLiveCalculation } from "@/lib/commission/live-calculation";
import {
  failureState,
  successState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import type { JobChangeOrderRow, JobRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  adjustmentInputsFromRows,
  financialInputsFromJob,
} from "@/lib/commission/queries";

/**
 * The final commission audit workflow: OPEN → REVIEW → FINALIZE, with the true-up
 * created separately through the existing commission event workflow.
 *
 * Finalizing is the only thing that writes the audit's snapshot, and it never creates
 * a commission event: the spec's separation is that the final true-up uses the
 * finalized snapshot, and a human still triggers it. There is no delete anywhere —
 * a corrected audit supersedes the old revision and opens a new one.
 */

function revalidateJob(jobId: string) {
  revalidatePath(`/commissions/jobs/${jobId}`);
  revalidatePath("/commissions/jobs");
  revalidatePath("/commissions");
}

type JobLivePicture = {
  job: JobRow;
  calculation: ReturnType<typeof buildLiveCalculation>;
  hasPlanVersion: boolean;
};

/** The live picture for a job, built server-side from stored data. */
async function livePictureForJob(jobId: string): Promise<JobLivePicture | null> {
  const supabase = await createSupabaseServerClient();
  const [jobResult, changeOrdersResult, context, settings] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase.from("job_change_orders").select("*").eq("job_id", jobId).eq("active", true),
    getJobCommissionContext(jobId),
    getCommissionSettings(),
  ]);

  if (jobResult.error || !jobResult.data || !context) {
    return null;
  }

  const job = jobResult.data as JobRow;
  const rollUp = changeOrderTotalsFromRows(
    (changeOrdersResult.data ?? []) as JobChangeOrderRow[],
  );
  const calculation = buildLiveCalculation({
    inputs: {
      ...financialInputsFromJob(job, jobCostRateDefaults(settings)),
      changeOrderRevenue: rollUp.revenue,
      changeOrderCost: rollUp.cost,
    },
    adjustments: adjustmentInputsFromRows(context.detail.adjustments),
    tiers: tierWindowsFromRows(context.detail.planVersionTiers),
    minimumGpStandard: toNumber(context.detail.category?.minimum_gp_standard),
    settings: settingsSnapshot(settings),
    onDraw: context.onDraw,
    previouslyRecognized: context.previouslyRecognized,
  });

  return {
    job,
    calculation,
    hasPlanVersion: job.compensation_plan_version_id !== null,
  };
}

/** OPEN: start a new revision in review. Nothing is snapshotted yet. */
export async function beginCommissionAudit(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("calculate:commission");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return failureState("A job is required.");

  const audits = await listJobAudits(jobId);

  if (audits.some((audit) => audit.status === "in_review")) {
    return failureState(
      "A final audit is already open for this job. Finalize it, or cancel it before starting again.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("commission_audits").insert({
    job_id: jobId,
    revision: nextAuditRevision(audits),
    status: "in_review",
    started_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "audit");

  revalidateJob(jobId);

  return successState(
    "Final audit opened for review. Review the financial picture below, correct anything that is wrong, then finalize. No commission event has been created.",
  );
}

/** FINALIZE: snapshot the audited figures onto the open revision. */
export async function finalizeCommissionAudit(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("calculate:commission");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  const auditId = String(formData.get("auditId") ?? "");
  if (!jobId || !auditId) return failureState("A final audit is required.");

  const audits = await listJobAudits(jobId);
  const audit = audits.find((candidate) => candidate.id === auditId);

  if (!audit) return failureState("That audit is not available to you.");
  if (audit.status !== "in_review") {
    return failureState("That audit is no longer in review. Reload the page.");
  }

  const picture = await livePictureForJob(jobId);
  if (!picture) return failureState("That job is not available to you.");

  const blockers = auditReadiness({
    calculation: picture.calculation,
    hasPlanVersion: picture.hasPlanVersion,
  });

  if (blockers.length > 0) {
    return failureState(blockers.join(" "));
  }

  const snapshot = buildFinalAuditSnapshot({ calculation: picture.calculation });
  const finalizedAt = new Date().toISOString();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("commission_audits")
    .update({
      status: "finalized",
      finalized_by: auth.userId,
      finalized_at: finalizedAt,
      original_contract_price: snapshot.originalContractPrice,
      change_order_revenue: snapshot.changeOrderRevenue,
      other_revenue: snapshot.otherRevenue,
      credit_amount: snapshot.creditAmount,
      original_cost: snapshot.originalCost,
      change_order_cost: snapshot.changeOrderCost,
      direct_job_cost: snapshot.directJobCost,
      burden_percent: snapshot.burdenPercent,
      burden_cost: snapshot.burdenCost,
      warranty_contingency_percent: snapshot.warrantyContingencyPercent,
      warranty_service_contingency: snapshot.warrantyServiceContingency,
      final_total_revenue: snapshot.finalTotalRevenue,
      final_total_cost: snapshot.finalTotalCost,
      final_gross_profit: snapshot.finalGrossProfit,
      final_gp_percent: snapshot.finalGpPercent,
      commissionable_revenue: snapshot.commissionableRevenue,
      commissionable_cost: snapshot.commissionableCost,
      commissionable_gross_profit: snapshot.commissionableGrossProfit,
      commissionable_gp_percent: snapshot.commissionableGpPercent,
      compensation_plan_id: picture.job.compensation_plan_id,
      compensation_plan_version_id: picture.job.compensation_plan_version_id,
      tier_label: snapshot.tierLabel,
      standard_commission_rate: snapshot.standardCommissionRate,
      draw_rate_reduction: snapshot.drawRateReduction,
      effective_commission_rate: snapshot.effectiveCommissionRate,
      final_gross_commission: snapshot.finalGrossCommission,
      previously_recognized: snapshot.previouslyRecognized,
      final_true_up: snapshot.finalTrueUp,
    })
    .eq("id", auditId)
    .eq("job_id", jobId)
    .select("id");

  if (error) return mutationErrorState(error, "audit");

  // The GP audit date becomes a consequence of the audit rather than an input.
  await supabase
    .from("jobs")
    .update({ gp_audit_completed_date: finalizedAt.slice(0, 10) })
    .eq("id", jobId);

  revalidateJob(jobId);

  return successState(
    `Revision ${audit.revision} finalized at these figures and locked. Create the final true-up from the Commission section; the audit no longer changes when the job's financials do.`,
  );
}

/** Re-open: supersede the current audit and start the next revision. */
export async function reopenCommissionAudit(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("calculate:commission");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return failureState("A job is required.");

  const supabase = await createSupabaseServerClient();
  const { data: finalEvents, error: eventError } = await supabase
    .from("commission_events")
    .select("id, status")
    .eq("job_id", jobId)
    .eq("event_type", "final_true_up")
    .order("created_at", { ascending: false });

  if (eventError) return mutationErrorState(eventError, "commission_event");

  const liveTrueUp = (finalEvents ?? []).find((event) => event.status !== "voided");

  if (liveTrueUp) {
    return failureState(
      "A final true-up already exists for this job. Void it through the commission workflow before re-opening the audit — a recognized payout is never overwritten.",
    );
  }

  const audits = await listJobAudits(jobId);

  if (audits.length === 0) {
    return failureState("There is no audit to re-open yet. Begin one first.");
  }

  if (audits.some((audit) => audit.status === "in_review")) {
    return failureState("An audit is already in review for this job.");
  }

  const { error: supersedeError } = await supabase
    .from("commission_audits")
    .update({ status: "superseded" })
    .eq("job_id", jobId)
    .eq("status", "finalized");

  if (supersedeError) return mutationErrorState(supersedeError, "audit");

  const { error } = await supabase.from("commission_audits").insert({
    job_id: jobId,
    revision: nextAuditRevision(audits),
    status: "in_review",
    started_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "audit");

  revalidateJob(jobId);

  return successState(
    "Final audit re-opened as a new revision. The previous revision is kept as history and still holds the figures it was finalized with.",
  );
}

/** Cancel an in-review revision. Nothing was snapshotted, so nothing is lost. */
export async function cancelCommissionAudit(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("calculate:commission");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  const auditId = String(formData.get("auditId") ?? "");
  if (!jobId || !auditId) return failureState("A final audit is required.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_audits")
    .update({ status: "superseded" })
    .eq("id", auditId)
    .eq("job_id", jobId)
    .eq("status", "in_review")
    .select("id");

  if (error) return mutationErrorState(error, "audit");
  if ((data ?? []).length === 0) {
    return failureState("That audit is no longer in review. Reload the page.");
  }

  revalidateJob(jobId);

  return successState("Final audit cancelled. The job's financials are untouched.");
}
