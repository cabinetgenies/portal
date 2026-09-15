"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { authorizeCapability } from "@/lib/auth/authorize";
import {
  resolveApplicablePlanVersion,
  resolveSalePlanSnapshot,
  type PlanVersionWindow,
} from "@/lib/compensation/plan-resolution";
import {
  changeOrderTotals,
  changeOrderTotalsFromRows,
} from "@/lib/commission/change-orders";
import {
  computeJobFinancials,
  toNumber,
  type JobCostRateDefaults,
} from "@/lib/commission/financials";
import { getCommissionSettings, jobCostRateDefaults } from "@/lib/commission/event-queries";
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
  jobChangeOrderActiveSchema,
  jobChangeOrderSchema,
  jobCompensationPlanSchema,
  jobEntrySchema,
  jobFinancialsSchema,
  jobOverviewSchema,
} from "@/lib/commission/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toDecimalPercent } from "@/lib/utils/percent";
import type {
  CompensationPlanVersionRow,
  JobChangeOrderRow,
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
  revalidatePath("/sales/commissions/jobs");
  if (jobId) {
    revalidatePath(`/sales/commissions/jobs/${jobId}`);
  }
}

function soldDateRequirement(status: string, soldDate: string | null) {
  if (status !== "presale" && !soldDate) {
    return "A sold date is required once a job moves past presale.";
  }

  return null;
}

/**
 * Resolves the cost rates a save should use: the submitted per-job override when
 * there is one, otherwise the company default in force. The resolved rates are
 * written onto the job, which is what makes the calculation reproducible after the
 * company default changes.
 */
async function resolveJobCostRates(overrides: {
  burdenPercent: number | null;
  warrantyContingencyPercent: number | null;
}): Promise<JobCostRateDefaults> {
  if (
    overrides.burdenPercent !== null &&
    overrides.warrantyContingencyPercent !== null
  ) {
    return {
      burdenPercent: overrides.burdenPercent,
      warrantyContingencyPercent: overrides.warrantyContingencyPercent,
    };
  }

  const defaults = jobCostRateDefaults(await getCommissionSettings());

  return {
    burdenPercent: overrides.burdenPercent ?? defaults.burdenPercent,
    warrantyContingencyPercent:
      overrides.warrantyContingencyPercent ?? defaults.warrantyContingencyPercent,
  };
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

/**
 * Recomputes and persists every derived column of a job.
 *
 * This is the only writer of `change_order_revenue` and `change_order_cost`: both
 * are derived from the active change order rows, so the aggregate can never drift
 * from the line items. Original contract price and original cost are inputs and are
 * left alone here.
 */
async function recalculateJobTotals(jobId: string) {
  const supabase = await createSupabaseServerClient();
  const [jobResult, adjustmentsResult, changeOrdersResult, settings] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase.from("job_financial_adjustments").select("*").eq("job_id", jobId),
    supabase
      .from("job_change_orders")
      .select("*")
      .eq("job_id", jobId)
      .eq("active", true),
    getCommissionSettings(),
  ]);

  if (jobResult.error || !jobResult.data) {
    return;
  }

  const job = jobResult.data as JobRow;
  const changeOrderRollUp = changeOrderTotalsFromRows(
    (changeOrdersResult.data ?? []) as JobChangeOrderRow[],
  );
  const financials = computeJobFinancials(
    {
      ...financialInputsFromJob(job, jobCostRateDefaults(settings)),
      // The roll-up comes from the rows, never from the stored columns.
      changeOrderRevenue: changeOrderRollUp.revenue,
      changeOrderCost: changeOrderRollUp.cost,
    },
    adjustmentInputsFromRows((adjustmentsResult.data ?? []) as JobFinancialAdjustmentRow[]),
  );

  await supabase
    .from("jobs")
    .update({
      change_order_revenue: changeOrderRollUp.revenue,
      change_order_cost: changeOrderRollUp.cost,
      burden_percent: financials.burdenPercent,
      warranty_contingency_percent: financials.warrantyContingencyPercent,
      burden_cost: financials.burdenCost,
      warranty_service_contingency: financials.warrantyServiceContingency,
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

  const rates = await resolveJobCostRates({
    burdenPercent:
      data.burdenPercent === null ? null : toDecimalPercent(data.burdenPercent),
    warrantyContingencyPercent:
      data.warrantyContingencyPercent === null
        ? null
        : toDecimalPercent(data.warrantyContingencyPercent),
  });

  // Change orders travel as line items. The job row only ever holds their roll-up,
  // so there is no second place to keep an aggregate in step.
  const changeOrderRollUp = changeOrderTotals(data.changeOrders);

  // Derived figures are written through the canonical calculation even when the
  // job starts at zero, so a new row can never disagree with the domain rules.
  const financials = computeJobFinancials({
    contractRevenue: data.contractRevenue,
    changeOrderRevenue: changeOrderRollUp.revenue,
    creditAmount: 0,
    otherRevenue: 0,
    originalCost: data.originalCost,
    changeOrderCost: changeOrderRollUp.cost,
    burdenPercent: rates.burdenPercent,
    warrantyContingencyPercent: rates.warrantyContingencyPercent,
  });

  const supabase = await createSupabaseServerClient();
  const { data: inserted, error } = await supabase
    .from("jobs")
    .insert({
      job_number: data.jobNumber,
      job_name: data.jobName,
      customer_name: data.customerName,
      status: data.status,
      sales_designer_id: data.salesDesignerId,
      sold_date: data.soldDate,
      deposit_received_date: data.depositReceivedDate,
      completion_date: data.completionDate,
      gp_audit_completed_date: data.gpAuditCompletedDate,
      contract_revenue: data.contractRevenue,
      change_order_revenue: changeOrderRollUp.revenue,
      change_order_cost: changeOrderRollUp.cost,
      credit_amount: 0,
      other_revenue: 0,
      original_cost: data.originalCost,
      burden_percent: rates.burdenPercent,
      warranty_contingency_percent: rates.warrantyContingencyPercent,
      burden_cost: financials.burdenCost,
      warranty_service_contingency: financials.warrantyServiceContingency,
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

  if (data.changeOrders.length > 0 && inserted?.id) {
    const { error: changeOrderError } = await supabase
      .from("job_change_orders")
      .insert(
        data.changeOrders.map((changeOrder) => ({
          job_id: inserted.id,
          change_order_number: changeOrder.changeOrderNumber,
          name: changeOrder.name,
          revenue: changeOrder.revenue,
          cost: changeOrder.cost,
          created_by: auth.userId,
        })),
      );

    if (changeOrderError) {
      // The job exists and is correct; the change orders are missing. Say so
      // rather than redirecting as if everything saved.
      return mutationErrorState(changeOrderError, "change_order");
    }
  }

  revalidateJobs(inserted?.id);
  redirect(`/sales/commissions/jobs/${inserted?.id}`);
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

  const [jobResult, adjustmentsResult, changeOrdersResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    supabase.from("job_financial_adjustments").select("*").eq("job_id", jobId),
    supabase.from("job_change_orders").select("*").eq("job_id", jobId).eq("active", true),
  ]);

  if (jobResult.error) return mutationErrorState(jobResult.error, "job");
  if (!jobResult.data) return failureState("That job is not available to you.");
  if (adjustmentsResult.error) {
    return mutationErrorState(adjustmentsResult.error, "adjustment");
  }
  if (changeOrdersResult.error) {
    return mutationErrorState(changeOrdersResult.error, "change_order");
  }

  const job = jobResult.data as JobRow;
  const changeOrderRollUp = changeOrderTotalsFromRows(
    (changeOrdersResult.data ?? []) as JobChangeOrderRow[],
  );

  const rates = await resolveJobCostRates({
    burdenPercent:
      money.burdenPercent === null ? null : toDecimalPercent(money.burdenPercent),
    warrantyContingencyPercent:
      money.warrantyContingencyPercent === null
        ? null
        : toDecimalPercent(money.warrantyContingencyPercent),
  });

  const financials = computeJobFinancials(
    {
      contractRevenue: money.contractRevenue,
      changeOrderRevenue: changeOrderRollUp.revenue,
      // Other revenue and credits are carried through from the stored row: they are
      // no longer inputs in the simplified form, but they still count if set.
      creditAmount: toNumber(job.credit_amount),
      otherRevenue: toNumber(job.other_revenue),
      originalCost: money.originalCost,
      changeOrderCost: changeOrderRollUp.cost,
      burdenPercent: rates.burdenPercent,
      warrantyContingencyPercent: rates.warrantyContingencyPercent,
    },
    adjustmentInputsFromRows(
      (adjustmentsResult.data ?? []) as JobFinancialAdjustmentRow[],
    ),
  );

  const { error } = await supabase
    .from("jobs")
    .update({
      contract_revenue: money.contractRevenue,
      original_cost: money.originalCost,
      change_order_revenue: changeOrderRollUp.revenue,
      change_order_cost: changeOrderRollUp.cost,
      burden_percent: rates.burdenPercent,
      warranty_contingency_percent: rates.warrantyContingencyPercent,
      burden_cost: financials.burdenCost,
      warranty_service_contingency: financials.warrantyServiceContingency,
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

  await recalculateJobTotals(jobId);
  revalidateJobs(jobId);

  return successState("Adjustment recorded and job totals recalculated.");
}

// ---------------------------------------------------------------------------
// Change orders
//
// Line items, never aggregates: every write here ends by recalculating the job's
// roll-ups and derived figures through the canonical calculation. Removing a change
// order deactivates it instead of deleting the row, so history survives once
// commission has been paid against it.
// ---------------------------------------------------------------------------

export async function createJobChangeOrder(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("edit:job-financials");
  if ("denied" in auth) return auth.denied;

  const parsed = jobChangeOrderSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, changeOrderNumber, name, revenue, cost } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("job_change_orders").insert({
    job_id: jobId,
    change_order_number: changeOrderNumber,
    name,
    revenue,
    cost,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "change_order");

  await recalculateJobTotals(jobId);
  revalidateJobs(jobId);

  return successState(
    "Change order added. Job revenue, direct cost and the commission projection are recalculated; any commission event already approved or paid keeps its own figures.",
  );
}

export async function updateJobChangeOrder(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("edit:job-financials");
  if ("denied" in auth) return auth.denied;

  const parsed = jobChangeOrderSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, changeOrderId, changeOrderNumber, name, revenue, cost } = parsed.data;

  if (!changeOrderId) return failureState("A change order is required.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_change_orders")
    .update({
      change_order_number: changeOrderNumber,
      name,
      revenue,
      cost,
    })
    .eq("id", changeOrderId)
    .eq("job_id", jobId)
    .select("id");

  if (error) return mutationErrorState(error, "change_order");
  if ((data ?? []).length === 0) {
    return failureState("That change order no longer exists. Refresh the page.");
  }

  await recalculateJobTotals(jobId);
  revalidateJobs(jobId);

  return successState("Change order updated and job totals recalculated.");
}

export async function setJobChangeOrderActive(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("edit:job-financials");
  if ("denied" in auth) return auth.denied;

  const parsed = jobChangeOrderActiveSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, changeOrderId, active } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("job_change_orders")
    .update({ active })
    .eq("id", changeOrderId)
    .eq("job_id", jobId)
    .select("id");

  if (error) return mutationErrorState(error, "change_order");
  if ((data ?? []).length === 0) {
    return failureState("That change order no longer exists. Refresh the page.");
  }

  await recalculateJobTotals(jobId);
  revalidateJobs(jobId);

  return successState(
    active
      ? "Change order restored and job totals recalculated."
      : "Change order removed from the active totals. The record is kept, and the audit trail shows it was voided rather than deleted.",
  );
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
