"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import {
  commissionSettingsSchema,
  compensationPlanSchema,
  compensationPlanVersionSchema,
  compensationTierSchema,
  employeeCompensationAssignmentSchema,
  employeeCompensationSettingsSchema,
} from "@/lib/compensation/validation";
import {
  failureState,
  formDataToObject,
  successState,
  validationErrorState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toDecimalPercent } from "@/lib/utils/percent";

/**
 * Writes for compensation configuration and employee participation.
 *
 * These actions manage *rules and participation only*. They never calculate,
 * approve or pay compensation of any kind, for sales designers or sales
 * managers. See docs/compensation-architecture.md for the extension point.
 */

function revalidateCompensation() {
  revalidatePath("/admin/compensation-plans");
  revalidatePath("/sales/commissions/rules");
  revalidatePath("/sales/commissions/employees");
  revalidatePath("/sales/commissions/jobs");
}

// ---------------------------------------------------------------------------
// Commission engine settings (deposit payout, draw reduction, draw enabled)
// ---------------------------------------------------------------------------

export async function saveCommissionSettings(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:compensation-config");
  if ("denied" in auth) return auth.denied;

  const parsed = commissionSettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    effectiveFrom,
    depositPayoutPercent,
    drawRateReduction,
    drawEnabled,
    burdenPercent,
    warrantyContingencyPercent,
    notes,
  } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("commission_settings").upsert(
    {
      effective_from: effectiveFrom,
      deposit_payout_percent: toDecimalPercent(depositPayoutPercent),
      draw_rate_reduction: toDecimalPercent(drawRateReduction),
      draw_enabled: drawEnabled,
      burden_percent: toDecimalPercent(burdenPercent),
      warranty_contingency_percent: toDecimalPercent(warrantyContingencyPercent),
      notes,
      created_by: auth.userId,
    },
    { onConflict: "effective_from" },
  );

  if (error) return mutationErrorState(error, "settings");

  revalidatePath("/sales/commissions/rules");
  revalidatePath("/admin/commission-settings");
  revalidatePath("/sales/commissions");
  revalidatePath("/sales/commissions/jobs");

  return successState(
    "Commission settings saved. These values apply to calculations made from the effective date onward. Jobs already saved keep the burden and warranty rates they were stored with, and existing commission events keep their snapshot.",
  );
}

// ---------------------------------------------------------------------------
// Compensation plans, effective-dated versions and tiers
// ---------------------------------------------------------------------------

export async function saveCompensationPlan(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:compensation-config");
  if ("denied" in auth) return auth.denied;

  const parsed = compensationPlanSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { id, name, description, participantKind, planType, active } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = {
    name,
    description,
    participant_kind: participantKind,
    plan_type: planType,
    active,
  };

  const result = id
    ? await supabase.from("compensation_plans").update(payload).eq("id", id)
    : await supabase.from("compensation_plans").insert(payload);

  if (result.error) return mutationErrorState(result.error, "plan");

  revalidateCompensation();

  return successState(
    id
      ? "Plan updated."
      : participantKind === "sales_manager"
        ? "Plan created. Sales manager plans are not calculated yet — no bonus or override is produced in this phase."
        : "Plan created. Add an effective-dated version next.",
  );
}

export async function setCompensationPlanActive(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:compensation-config");
  if ("denied" in auth) return auth.denied;

  const planId = String(formData.get("planId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!planId) return failureState("A plan is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("compensation_plans")
    .update({ active })
    .eq("id", planId);

  if (error) return mutationErrorState(error, "plan");

  revalidateCompensation();

  return successState(active ? "Plan activated." : "Plan deactivated.");
}

export async function saveCompensationPlanVersion(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:compensation-config");
  if ("denied" in auth) return auth.denied;

  const parsed = compensationPlanVersionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    compensationPlanId,
    versionName,
    effectiveFrom,
    effectiveTo,
    active,
    notes,
  } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("compensation_plan_versions").insert({
    compensation_plan_id: compensationPlanId,
    version_name: versionName,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    active,
    notes,
  });

  if (error) return mutationErrorState(error, "version");

  revalidateCompensation();

  return successState(
    "Plan version created. Jobs already attributed to an earlier version keep it.",
  );
}

export async function setCompensationPlanVersionActive(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:compensation-config");
  if ("denied" in auth) return auth.denied;

  const versionId = String(formData.get("versionId") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  if (!versionId) return failureState("A plan version is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("compensation_plan_versions")
    .update({ active })
    .eq("id", versionId);

  if (error) return mutationErrorState(error, "version");

  revalidateCompensation();

  return successState(active ? "Version activated." : "Version deactivated.");
}

export async function saveCompensationTier(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:compensation-config");
  if ("denied" in auth) return auth.denied;

  const parsed = compensationTierSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const {
    compensationPlanVersionId,
    sortOrder,
    lowerThresholdType,
    lowerValue,
    upperThresholdType,
    upperValue,
    ratePercent,
    label,
  } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("compensation_plan_tiers").insert({
    compensation_plan_version_id: compensationPlanVersionId,
    sort_order: sortOrder,
    lower_threshold_type: lowerThresholdType,
    lower_gp_percent: lowerValue === null ? null : toDecimalPercent(lowerValue),
    upper_threshold_type: upperThresholdType,
    upper_gp_percent: upperValue === null ? null : toDecimalPercent(upperValue),
    rate: toDecimalPercent(ratePercent),
    label,
  });

  if (error) return mutationErrorState(error, "tier");

  revalidateCompensation();

  return successState("Tier added to this plan version.");
}

// ---------------------------------------------------------------------------
// Employee eligibility and dated plan assignments
// ---------------------------------------------------------------------------

export async function saveEmployeeCompensationSettings(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:employee-compensation");
  if ("denied" in auth) return auth.denied;

  const parsed = employeeCompensationSettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, compensationEligible, notes } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("employee_compensation_settings")
    .upsert(
      { profile_id: profileId, compensation_eligible: compensationEligible, notes },
      { onConflict: "profile_id" },
    );

  if (error) return mutationErrorState(error, "settings");

  revalidateCompensation();

  return successState("Compensation eligibility saved.");
}

export async function createEmployeeCompensationAssignment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:employee-compensation");
  if ("denied" in auth) return auth.denied;

  const parsed = employeeCompensationAssignmentSchema.safeParse(
    formDataToObject(formData),
  );
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, compensationPlanId, effectiveFrom, effectiveTo, notes } =
    parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("employee_compensation_assignments")
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
        .from("employee_compensation_assignments")
        .update({ effective_to: closingDate })
        .eq("id", assignment.id);

      if (closeError) return mutationErrorState(closeError, "assignment");
    }
  }

  const { error } = await supabase.from("employee_compensation_assignments").insert({
    profile_id: profileId,
    compensation_plan_id: compensationPlanId,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "assignment");

  revalidateCompensation();

  return successState(
    overlaps.length > 0
      ? "Assignment saved. The previous assignment was closed the day before this one starts."
      : "Compensation plan assignment saved.",
  );
}

function dayBefore(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
