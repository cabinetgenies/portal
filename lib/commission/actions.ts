"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorizeCapability } from "@/lib/auth/authorize";
import {
  resolveApplicablePlanVersion,
  resolveSalePlanSnapshot,
  type PlanVersionWindow,
} from "@/lib/compensation/plan-resolution";
import { computeJobFinancials } from "@/lib/commission/financials";
import { adjustmentInputsFromRows, financialInputsFromJob } from "@/lib/commission/queries";
import {
  failureState,
  formDataToObject,
  successState,
  validationErrorState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import {
  jobAdjustmentSchema,
  jobCompensationPlanSchema,
  jobEntrySchema,
  jobFinancialsSchema,
  jobOverviewSchema,
} from "@/lib/commission/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompensationPlanVersionRow,
  JobFinancialAdjustmentRow,
  JobRow,
} from "@/lib/supabase/database.types";

/**
 * Job writes.
 *
 * A job records its financial structure and the compensation plan version that
 * governs its single sales designer. Compensation *rules* are written by
 * lib/compensation/actions.ts, and no payout is calculated anywhere in this
 * phase — see docs/compensation-architecture.md.
 */

function revalidateJobs(jobId?: string) {
  revalidatePath("/commissions/jobs");
  if (jobId) {
    revalidatePath(`/commissions/jobs/${jobId}`);
  }
}

function soldDateRequirement(status: string, soldDate: string | null) {
  if (status !== "presale" && !soldDate) {
    return "A sold date is required once a job moves past presale.";
  }

  return null;
}

/**
 * A job references either both a plan and a version, or neither.
 *
 * The database enforces this too (`jobs_validate_plan_reference`), but checking
 * here turns a constraint violation into a sentence an administrator can act on.
 */
async function validateJobPlanPairing(
  compensationPlanId: string | null,
  compensationPlanVersionId: string | null,
) {
  if ((compensationPlanId === null) !== (compensationPlanVersionId === null)) {
    return failureState(
      "Choose both a compensation plan and a version, or leave both empty.",
    );
  }

  if (!compensationPlanId || !compensationPlanVersionId) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const [planResult, versionResult] = await Promise.all([
    supabase
      .from("compensation_plans")
      .select("id, participant_kind")
      .eq("id", compensationPlanId)
      .maybeSingle(),
    supabase
      .from("compensation_plan_versions")
      .select("id, compensation_plan_id")
      .eq("id", compensationPlanVersionId)
      .maybeSingle(),
  ]);

  if (planResult.error) return mutationErrorState(planResult.error, "plan");
  if (versionResult.error) return mutationErrorState(versionResult.error, "version");

  if (!planResult.data || planResult.data.participant_kind !== "sales_designer") {
    return failureState(
      "A job can only reference a sales designer compensation plan. Manager plans are attributed to qualifying jobs separately.",
    );
  }

  if (
    !versionResult.data ||
    versionResult.data.compensation_plan_id !== compensationPlanId
  ) {
    return failureState("That version does not belong to the selected plan.");
  }

  return null;
}

/** Recomputes and persists the derived columns from the stored inputs. */
async function refreshJobTotals(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const [jobResult, adjustmentsResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase.from("job_financial_adjustments").select("*").eq("job_id", jobId),
  ]);

  if (jobResult.error || !jobResult.data) {
    return;
  }

  const job = jobResult.data as JobRow;
  const financials = computeJobFinancials(
    financialInputsFromJob(job),
    adjustmentInputsFromRows((adjustmentsResult.data ?? []) as JobFinancialAdjustmentRow[]),
  );

  await supabase
    .from("jobs")
    .update({
      actual_total_revenue: financials.actualTotalRevenue,
      actual_total_cost: financials.actualTotalCost,
      job_gross_profit: financials.jobGrossProfit,
      job_gp_percent: financials.jobGpPercent,
      commissionable_revenue: financials.commissionableRevenue,
      commissionable_cost: financials.commissionableCost,
      commissionable_gross_profit: financials.commissionableGrossProfit,
      commissionable_gp_percent: financials.commissionableGpPercent,
    })
    .eq("id", jobId);
}

export async function createJob(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const parsed = jobEntrySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const data = parsed.data;
  const dateError = soldDateRequirement(data.status, data.soldDate);

  if (dateError) {
    return {
      status: "error",
      message: dateError,
      fieldErrors: { soldDate: [dateError] },
    };
  }

  const planError = await validateJobPlanPairing(
    data.compensationPlanId,
    data.compensationPlanVersionId,
  );

  if (planError) return planError;

  // Derived figures are written through the canonical calculation even when the
  // job starts at zero, so a new row can never disagree with the domain rules.
  const financials = computeJobFinancials({
    contractRevenue: data.contractRevenue,
    changeOrderRevenue: data.changeOrderRevenue,
    creditAmount: data.creditAmount,
    otherRevenue: data.otherRevenue,
    materialCost: data.materialCost,
    laborCost: data.laborCost,
    subcontractorCost: data.subcontractorCost,
    otherDirectCost: data.otherDirectCost,
    burdenCost: data.burdenCost,
    warrantyServiceContingency: data.warrantyServiceContingency,
  });

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("jobs")
    .insert({
      job_number: data.jobNumber,
      job_name: data.jobName,
      customer_name: data.customerName,
      project_category_id: data.projectCategoryId,
      status: data.status,
      sales_designer_id: data.salesDesignerId,
      sold_date: data.soldDate,
      deposit_received_date: data.depositReceivedDate,
      completion_date: data.completionDate,
      gp_audit_completed_date: data.gpAuditCompletedDate,
      contract_revenue: data.contractRevenue,
      change_order_revenue: data.changeOrderRevenue,
      credit_amount: data.creditAmount,
      other_revenue: data.otherRevenue,
      material_cost: data.materialCost,
      labor_cost: data.laborCost,
      subcontractor_cost: data.subcontractorCost,
      other_direct_cost: data.otherDirectCost,
      burden_cost: data.burdenCost,
      warranty_service_contingency: data.warrantyServiceContingency,
      compensation_plan_id: data.compensationPlanId,
      compensation_plan_version_id: data.compensationPlanVersionId,
      actual_total_revenue: financials.actualTotalRevenue,
      actual_total_cost: financials.actualTotalCost,
      job_gross_profit: financials.jobGrossProfit,
      job_gp_percent: financials.jobGpPercent,
      commissionable_revenue: financials.commissionableRevenue,
      commissionable_cost: financials.commissionableCost,
      commissionable_gross_profit: financials.commissionableGrossProfit,
      commissionable_gp_percent: financials.commissionableGpPercent,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error) return mutationErrorState(error, "job");

  revalidateJobs(inserted?.id);
  redirect(`/commissions/jobs/${inserted?.id}`);
}

export async function updateJobOverview(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const parsed = jobOverviewSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const data = parsed.data;

  if (!data.jobId) return failureState("A job is required.");

  const dateError = soldDateRequirement(data.status, data.soldDate);

  if (dateError) {
    return {
      status: "error",
      message: dateError,
      fieldErrors: { soldDate: [dateError] },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      job_number: data.jobNumber,
      job_name: data.jobName,
      customer_name: data.customerName,
      project_category_id: data.projectCategoryId,
      status: data.status,
      sales_designer_id: data.salesDesignerId,
      sold_date: data.soldDate,
      deposit_received_date: data.depositReceivedDate,
      completion_date: data.completionDate,
      gp_audit_completed_date: data.gpAuditCompletedDate,
    })
    .eq("id", data.jobId);

  if (error) return mutationErrorState(error, "job");

  revalidateJobs(data.jobId);

  return successState("Job details saved.");
}

export async function updateJobFinancials(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("edit:job-financials");
  if ("denied" in auth) return auth.denied;

  const parsed = jobFinancialsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, ...money } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: adjustments, error: adjustmentError } = await supabase
    .from("job_financial_adjustments")
    .select("*")
    .eq("job_id", jobId);

  if (adjustmentError) return mutationErrorState(adjustmentError, "adjustment");

  const financials = computeJobFinancials(
    money,
    adjustmentInputsFromRows((adjustments ?? []) as JobFinancialAdjustmentRow[]),
  );

  const { error } = await supabase
    .from("jobs")
    .update({
      contract_revenue: money.contractRevenue,
      change_order_revenue: money.changeOrderRevenue,
      credit_amount: money.creditAmount,
      other_revenue: money.otherRevenue,
      material_cost: money.materialCost,
      labor_cost: money.laborCost,
      subcontractor_cost: money.subcontractorCost,
      other_direct_cost: money.otherDirectCost,
      burden_cost: money.burdenCost,
      warranty_service_contingency: money.warrantyServiceContingency,
      actual_total_revenue: financials.actualTotalRevenue,
      actual_total_cost: financials.actualTotalCost,
      job_gross_profit: financials.jobGrossProfit,
      job_gp_percent: financials.jobGpPercent,
      commissionable_revenue: financials.commissionableRevenue,
      commissionable_cost: financials.commissionableCost,
      commissionable_gross_profit: financials.commissionableGrossProfit,
      commissionable_gp_percent: financials.commissionableGpPercent,
    })
    .eq("id", jobId);

  if (error) return mutationErrorState(error, "job");

  revalidateJobs(jobId);

  return successState("Financials saved and totals recalculated.");
}

export async function createJobFinancialAdjustment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("create:job-adjustments");
  if ("denied" in auth) return auth.denied;

  const parsed = jobAdjustmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, adjustmentType, amount, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("job_financial_adjustments").insert({
    job_id: jobId,
    adjustment_type: adjustmentType,
    amount,
    reason,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "adjustment");

  await refreshJobTotals(jobId);
  revalidateJobs(jobId);

  return successState("Adjustment recorded and job totals recalculated.");
}

/**
 * Attaches the sales designer compensation plan version that governs a job.
 *
 * Only sales designer plans are attachable: the database rejects a job that
 * references a manager plan, because manager compensation is attributed to
 * qualifying jobs separately.
 */
export async function assignJobCompensationPlan(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const parsed = jobCompensationPlanSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, compensationPlanId, compensationPlanVersionId } = parsed.data;

  if ((compensationPlanId === null) !== (compensationPlanVersionId === null)) {
    return failureState(
      "Choose both a plan and a version, or clear both to detach the plan.",
    );
  }

  const supabase = await createSupabaseServerClient();

  if (compensationPlanId) {
    const { data: plan, error: planError } = await supabase
      .from("compensation_plans")
      .select("id, participant_kind")
      .eq("id", compensationPlanId)
      .maybeSingle();

    if (planError) return mutationErrorState(planError, "plan");

    if (!plan || plan.participant_kind !== "sales_designer") {
      return failureState(
        "A job can only reference a sales designer compensation plan. Manager plans are attributed to qualifying jobs separately.",
      );
    }
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      compensation_plan_id: compensationPlanId,
      compensation_plan_version_id: compensationPlanVersionId,
    })
    .eq("id", jobId);

  if (error) return mutationErrorState(error, "job");

  revalidateJobs(jobId);

  return successState(
    compensationPlanId
      ? "Compensation plan version attached."
      : "Compensation plan detached.",
  );
}

/**
 * Snapshots the plan version that was effective on the job's sold date, using
 * the sales designer's compensation assignment at that time.
 *
 * This is the service hook a future "mark job sold" action will call. It stays an
 * explicit administrator action so nothing about history changes automatically.
 */
export async function attachPlanEffectiveOnSoldDate(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");

  if (!jobId) return failureState("A job is required.");

  const supabase = await createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, sold_date, sales_designer_id, compensation_plan_id, compensation_plan_version_id",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return mutationErrorState(jobError, "job");
  if (!job) return failureState("That job is not available to you.");

  const soldDate = job.sold_date;

  if (!soldDate) {
    return failureState("Set the sold date before attaching the compensation plan version.");
  }

  if (!job.sales_designer_id) {
    return failureState(
      "Assign a sales designer before attaching the compensation plan version.",
    );
  }

  if (job.compensation_plan_version_id) {
    return failureState(
      "This job already has a compensation plan version. Detach it first if it needs to change.",
    );
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("employee_compensation_assignments")
    .select("*")
    .eq("profile_id", job.sales_designer_id);

  if (assignmentError) return mutationErrorState(assignmentError, "assignment");

  const applicableAssignment = (assignments ?? []).find((assignment) => {
    if (assignment.effective_from > soldDate) return false;
    return assignment.effective_to === null || assignment.effective_to >= soldDate;
  });

  if (!applicableAssignment) {
    return failureState(
      "The sales designer had no compensation plan assignment on the sold date.",
    );
  }

  const { data: plan, error: planError } = await supabase
    .from("compensation_plans")
    .select("id, participant_kind")
    .eq("id", applicableAssignment.compensation_plan_id)
    .maybeSingle();

  if (planError) return mutationErrorState(planError, "plan");

  if (!plan || plan.participant_kind !== "sales_designer") {
    return failureState(
      "The plan assigned to this designer on the sold date is not a sales designer plan.",
    );
  }

  const { data: versionRows, error: versionError } = await supabase
    .from("compensation_plan_versions")
    .select("*")
    .eq("compensation_plan_id", applicableAssignment.compensation_plan_id);

  if (versionError) return mutationErrorState(versionError, "version");

  const versions: PlanVersionWindow[] = (
    (versionRows ?? []) as CompensationPlanVersionRow[]
  ).map((version) => ({
    id: version.id,
    commissionPlanId: version.compensation_plan_id,
    versionName: version.version_name,
    effectiveFrom: version.effective_from,
    effectiveTo: version.effective_to,
    active: version.active,
  }));

  const snapshot = resolveSalePlanSnapshot({ versions, soldDate });

  if (!snapshot) {
    const ignoringActiveFlag = resolveApplicablePlanVersion(
      versions.map((version) => ({ ...version, active: true })),
      soldDate,
    );

    return failureState(
      ignoringActiveFlag
        ? "The plan version covering that sold date is inactive. Activate it or attach a version manually."
        : "No plan version covers that sold date. Check the plan's effective dates.",
    );
  }

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      compensation_plan_id: snapshot.commissionPlanId,
      compensation_plan_version_id: snapshot.commissionPlanVersionId,
    })
    .eq("id", jobId);

  if (updateError) return mutationErrorState(updateError, "job");

  revalidateJobs(jobId);

  return successState("Attached the plan version that was effective on the sold date.");
}
