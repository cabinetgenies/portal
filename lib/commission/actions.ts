"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { computeJobFinancials, toNumber } from "@/lib/commission/financials";
import {
  resolveApplicablePlanVersion,
  resolveSalePlanSnapshot,
  type PlanVersionWindow,
} from "@/lib/commission/plan-resolution";
import { isAdjustmentType, type AdjustmentType } from "@/lib/commission/types";
import {
  commissionPlanSchema,
  commissionPlanVersionSchema,
  commissionTierSchema,
  employeeCommissionAssignmentSchema,
  employeeCommissionSettingsSchema,
  failureState,
  formDataToObject,
  jobAdjustmentSchema,
  jobFinancialsSchema,
  jobOverviewSchema,
  jobPlanAssignmentSchema,
  projectCategorySchema,
  successState,
  toDecimalPercent,
  validationErrorState,
  type ActionState,
} from "@/lib/commission/validation";
import { getSessionContext } from "@/lib/auth/dal";
import type { Capability } from "@/lib/permissions/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommissionPlanVersionRow,
  JobFinancialAdjustmentRow,
  JobRow,
} from "@/lib/supabase/database.types";

/**
 * Every write in the commission domain goes through this file.
 *
 * Each action re-verifies the session and the capability before touching data,
 * and Row Level Security enforces the same rules again in Postgres. UI visibility
 * is never the control.
 */

type Authorized = { userId: string } | { denied: ActionState };

async function authorize(capability: Capability): Promise<Authorized> {
  const session = await getSessionContext();

  if (!session) {
    return {
      denied: failureState("Your session has expired. Sign in again to continue."),
    };
  }

  if (!session.capabilities.includes(capability)) {
    return { denied: failureState("Your role does not allow this change.") };
  }

  return { userId: session.userId };
}

type PostgresError = { code?: string; message: string };

/**
 * Turns database constraint failures into something a person can act on. The
 * messages describe the rule, never the SQL.
 */
function mutationErrorState(error: PostgresError, context: string): ActionState {
  switch (error.code) {
    case "23505":
      return failureState(
        context === "category"
          ? "Another category already uses that code."
          : context === "plan"
            ? "A commission plan with that name already exists."
            : context === "version"
              ? "That plan already has a version with this name."
              : context === "tier"
                ? "Another tier in this version already uses that evaluation order."
                : "A record with those details already exists.",
      );
    case "23P01":
      return failureState(
        context === "version"
          ? "Another active version of this plan already covers those dates."
          : context === "assignment"
            ? "This employee already has a plan assignment covering those dates."
            : "Those dates overlap another record.",
      );
    case "23514":
    case "23503":
      return failureState(
        "Those values are not valid for this record. Check the fields and try again.",
      );
    case "42501":
      return failureState("Your role is not allowed to change this record.");
    default:
      console.error(`Commission mutation failed (${context}):`, error.message);
      return failureState(
        "The change could not be saved. Try again, and contact an administrator if it keeps failing.",
      );
  }
}

/** Filters stored adjustments down to the supported types before doing math. */
function toAdjustmentInputs(rows: readonly JobFinancialAdjustmentRow[]) {
  return rows
    .filter(
      (
        row,
      ): row is JobFinancialAdjustmentRow & { adjustment_type: AdjustmentType } =>
        isAdjustmentType(row.adjustment_type),
    )
    .map((row) => ({
      adjustmentType: row.adjustment_type,
      amount: toNumber(row.amount),
    }));
}

function financialInputsFromJob(job: JobRow) {
  return {
    contractRevenue: toNumber(job.contract_revenue),
    changeOrderRevenue: toNumber(job.change_order_revenue),
    creditAmount: toNumber(job.credit_amount),
    otherRevenue: toNumber(job.other_revenue),
    materialCost: toNumber(job.material_cost),
    laborCost: toNumber(job.labor_cost),
    subcontractorCost: toNumber(job.subcontractor_cost),
    otherDirectCost: toNumber(job.other_direct_cost),
    burdenCost: toNumber(job.burden_cost),
    warrantyServiceContingency: toNumber(job.warranty_service_contingency),
  };
}

function revalidateJobs(jobId?: string) {
  revalidatePath("/commissions/jobs");
  if (jobId) {
    revalidatePath(`/commissions/jobs/${jobId}`);
  }
}

function revalidateCommissionPlans() {
  revalidatePath("/admin/commission-plans");
  revalidatePath("/commissions/rules");
  revalidateJobs();
}

// ---------------------------------------------------------------------------
// Project categories
// ---------------------------------------------------------------------------

export async function saveProjectCategory(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:commission-config");
  if ("denied" in auth) return auth.denied;

  const parsed = projectCategorySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { id, name, code, minimumGpStandardPercent, sortOrder, active } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = {
    name,
    code: code.toUpperCase(),
    minimum_gp_standard: toDecimalPercent(minimumGpStandardPercent),
    sort_order: sortOrder,
    active,
  };

  const result = id
    ? await supabase.from("project_categories").update(payload).eq("id", id)
    : await supabase.from("project_categories").insert(payload);

  if (result.error) return mutationErrorState(result.error, "category");

  revalidatePath("/admin/project-categories");
  revalidateJobs();

  return successState(id ? "Category updated." : "Category created.");
}

// ---------------------------------------------------------------------------
// Commission plans, versions and tiers
// ---------------------------------------------------------------------------

export async function saveCommissionPlan(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:commission-config");
  if ("denied" in auth) return auth.denied;

  const parsed = commissionPlanSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { id, name, description, planType, active } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = { name, description, plan_type: planType, active };

  const result = id
    ? await supabase.from("commission_plans").update(payload).eq("id", id)
    : await supabase.from("commission_plans").insert(payload);

  if (result.error) return mutationErrorState(result.error, "plan");

  revalidateCommissionPlans();

  return successState(
    id ? "Plan updated." : "Plan created. Add an effective-dated version next.",
  );
}

export async function setCommissionPlanActive(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:commission-config");
  if ("denied" in auth) return auth.denied;

  const planId = String(formData.get("planId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!planId) return failureState("A plan is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("commission_plans")
    .update({ active })
    .eq("id", planId);

  if (error) return mutationErrorState(error, "plan");

  revalidateCommissionPlans();

  return successState(active ? "Plan activated." : "Plan deactivated.");
}

export async function saveCommissionPlanVersion(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:commission-config");
  if ("denied" in auth) return auth.denied;

  const parsed = commissionPlanVersionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { commissionPlanId, versionName, effectiveFrom, effectiveTo, active, notes } =
    parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("commission_plan_versions").insert({
    commission_plan_id: commissionPlanId,
    version_name: versionName,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    active,
    notes,
  });

  if (error) return mutationErrorState(error, "version");

  revalidateCommissionPlans();

  return successState("Plan version created. Existing jobs keep the version they were sold under.");
}

export async function setCommissionPlanVersionActive(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:commission-config");
  if ("denied" in auth) return auth.denied;

  const versionId = String(formData.get("versionId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!versionId) return failureState("A plan version is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("commission_plan_versions")
    .update({ active })
    .eq("id", versionId);

  if (error) return mutationErrorState(error, "version");

  revalidateCommissionPlans();

  return successState(active ? "Version activated." : "Version deactivated.");
}

export async function saveCommissionTier(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:commission-config");
  if ("denied" in auth) return auth.denied;

  const parsed = commissionTierSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    commissionPlanVersionId,
    sortOrder,
    lowerThresholdType,
    lowerValue,
    upperThresholdType,
    upperValue,
    ratePercent,
    label,
  } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("commission_tiers").insert({
    commission_plan_version_id: commissionPlanVersionId,
    sort_order: sortOrder,
    lower_threshold_type: lowerThresholdType,
    lower_gp_percent: lowerValue === null ? null : toDecimalPercent(lowerValue),
    upper_threshold_type: upperThresholdType,
    upper_gp_percent: upperValue === null ? null : toDecimalPercent(upperValue),
    rate: toDecimalPercent(ratePercent),
    label,
  });

  if (error) return mutationErrorState(error, "tier");

  revalidateCommissionPlans();

  return successState("Tier added to this plan version.");
}

// ---------------------------------------------------------------------------
// Employee commission settings and assignments
// ---------------------------------------------------------------------------

export async function saveEmployeeCommissionSettings(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:employee-commission");
  if ("denied" in auth) return auth.denied;

  const parsed = employeeCommissionSettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, commissionEligible, notes } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("employee_commission_settings")
    .upsert(
      { profile_id: profileId, commission_eligible: commissionEligible, notes },
      { onConflict: "profile_id" },
    );

  if (error) return mutationErrorState(error, "settings");

  revalidatePath("/commissions/employees");
  revalidatePath(`/commissions/jobs`);

  return successState("Commission eligibility saved.");
}

export async function createEmployeeCommissionAssignment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:employee-commission");
  if ("denied" in auth) return auth.denied;

  const parsed = employeeCommissionAssignmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, commissionPlanId, effectiveFrom, effectiveTo, notes } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("employee_commission_assignments")
    .select("*")
    .eq("profile_id", profileId);

  if (existingError) return mutationErrorState(existingError, "assignment");

  const overlaps = (existing ?? []).filter((assignment) => {
    const existingEnd = assignment.effective_to ?? "9999-12-31";
    const newEnd = effectiveTo ?? "9999-12-31";
    return effectiveFrom <= existingEnd && newEnd >= assignment.effective_from;
  });

  for (const assignment of overlaps) {
    if (assignment.effective_from >= effectiveFrom) {
      return failureState(
        "An assignment already covers part of this period. Remove the overlapping assignment first.",
      );
    }
  }

  // Close any earlier assignment the day before the new one starts, so changing
  // plans adds history instead of overwriting it.
  for (const assignment of overlaps) {
    const closingDate = dayBefore(effectiveFrom);

    if (assignment.effective_to !== closingDate) {
      const { error: closeError } = await supabase
        .from("employee_commission_assignments")
        .update({ effective_to: closingDate })
        .eq("id", assignment.id);

      if (closeError) return mutationErrorState(closeError, "assignment");
    }
  }

  const { error } = await supabase.from("employee_commission_assignments").insert({
    profile_id: profileId,
    commission_plan_id: commissionPlanId,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "assignment");

  revalidatePath("/commissions/employees");

  return successState(
    overlaps.length > 0
      ? "Assignment saved. The previous assignment was closed the day before this one starts."
      : "Commission plan assignment saved.",
  );
}

function dayBefore(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

function soldDateRequirement(status: string, soldDate: string | null) {
  if (status !== "presale" && !soldDate) {
    return "A sold date is required once a job moves past presale.";
  }

  return null;
}

export async function createJob(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const parsed = jobOverviewSchema.safeParse(formDataToObject(formData));
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

  // Derived figures are written through the canonical calculation even when the
  // job starts at zero, so a new row can never disagree with the domain rules.
  const financials = computeJobFinancials({
    contractRevenue: 0,
    changeOrderRevenue: 0,
    creditAmount: 0,
    otherRevenue: 0,
    materialCost: 0,
    laborCost: 0,
    subcontractorCost: 0,
    otherDirectCost: 0,
    burdenCost: 0,
    warrantyServiceContingency: 0,
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
  const auth = await authorize("manage:jobs");
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
    toAdjustmentInputs((adjustmentsResult.data ?? []) as JobFinancialAdjustmentRow[]),
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

export async function updateJobFinancials(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("edit:job-financials");
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
    toAdjustmentInputs((adjustments ?? []) as JobFinancialAdjustmentRow[]),
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
  const auth = await authorize("create:job-adjustments");
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

export async function assignJobCommissionPlan(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const parsed = jobPlanAssignmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { jobId, commissionPlanId, commissionPlanVersionId } = parsed.data;

  if ((commissionPlanId === null) !== (commissionPlanVersionId === null)) {
    return failureState(
      "Choose both a plan and a version, or clear both to detach the plan.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      commission_plan_id: commissionPlanId,
      commission_plan_version_id: commissionPlanVersionId,
    })
    .eq("id", jobId);

  if (error) return mutationErrorState(error, "job");

  revalidateJobs(jobId);

  return successState(
    commissionPlanId ? "Commission plan version attached." : "Commission plan detached.",
  );
}

/**
 * Snapshots the plan version that was effective on the job's sold date, using
 * the sales designer's commission assignment at that time.
 *
 * This is the service hook a future "mark job sold" action will call. It stays an
 * explicit administrator action in Phase 2 so nothing about history changes
 * behind anyone's back.
 */
export async function attachPlanEffectiveOnSoldDate(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorize("manage:jobs");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");

  if (!jobId) return failureState("A job is required.");

  const supabase = await createSupabaseServerClient();
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, sold_date, sales_designer_id, commission_plan_id, commission_plan_version_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) return mutationErrorState(jobError, "job");
  if (!job) return failureState("That job is not available to you.");

  const soldDate = job.sold_date;

  if (!soldDate) {
    return failureState("Set the sold date before attaching the commission plan version.");
  }

  if (!job.sales_designer_id) {
    return failureState("Assign a sales designer before attaching the commission plan version.");
  }

  if (job.commission_plan_version_id) {
    return failureState(
      "This job already has a commission plan version. Detach it first if it needs to change.",
    );
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from("employee_commission_assignments")
    .select("*")
    .eq("profile_id", job.sales_designer_id);

  if (assignmentError) return mutationErrorState(assignmentError, "assignment");

  const applicableAssignment = (assignments ?? []).find((assignment) => {
    if (assignment.effective_from > soldDate) return false;
    return assignment.effective_to === null || assignment.effective_to >= soldDate;
  });

  if (!applicableAssignment) {
    return failureState(
      "The sales designer had no commission plan assignment on the sold date.",
    );
  }

  const { data: versionRows, error: versionError } = await supabase
    .from("commission_plan_versions")
    .select("*")
    .eq("commission_plan_id", applicableAssignment.commission_plan_id);

  if (versionError) return mutationErrorState(versionError, "version");

  const versions: PlanVersionWindow[] = ((versionRows ?? []) as CommissionPlanVersionRow[]).map(
    (version) => ({
      id: version.id,
      commissionPlanId: version.commission_plan_id,
      versionName: version.version_name,
      effectiveFrom: version.effective_from,
      effectiveTo: version.effective_to,
      active: version.active,
    }),
  );

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
      commission_plan_id: snapshot.commissionPlanId,
      commission_plan_version_id: snapshot.commissionPlanVersionId,
    })
    .eq("id", jobId);

  if (updateError) return mutationErrorState(updateError, "job");

  revalidateJobs(jobId);

  return successState("Attached the plan version that was effective on the sold date.");
}
