"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import { roundMoney } from "@/lib/commission/financials";
import {
  drawAdvanceSchema,
  drawPeriodSchema,
  endDrawPeriodSchema,
  ledgerAdjustmentSchema,
} from "@/lib/commission/validation";
import {
  failureState,
  formDataToObject,
  successState,
  validationErrorState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Draw-against-commission administration.
 *
 * Everything here is an administrative act (admin/CEO): enrollment is
 * effective-dated, and every money movement is an append-only ledger entry with a
 * documented reason. Balances are always derived from those entries.
 */

function revalidateDraw() {
  revalidatePath("/sales/commissions/employees");
  revalidatePath("/sales/commissions");
  revalidatePath("/sales/commissions/payments");
}

export async function placeEmployeeOnDraw(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:draw");
  if ("denied" in auth) return auth.denied;

  const parsed = drawPeriodSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, effectiveFrom, effectiveTo, notes } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: openPeriods, error: openError } = await supabase
    .from("employee_draw_periods")
    .select("id, effective_from, effective_to")
    .eq("profile_id", profileId)
    .is("effective_to", null);

  if (openError) return mutationErrorState(openError, "draw");

  if ((openPeriods ?? []).length > 0) {
    return failureState(
      "This employee is already on draw. End the current draw period before starting a new one.",
    );
  }

  const { error } = await supabase.from("employee_draw_periods").insert({
    profile_id: profileId,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    notes,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "draw");

  revalidateDraw();

  return successState(
    "Employee placed on draw. Their commission rate is reduced by the configured number of percentage points for jobs calculated inside this period.",
  );
}

export async function endEmployeeDraw(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:draw");
  if ("denied" in auth) return auth.denied;

  const parsed = endDrawPeriodSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, effectiveTo, notes } = parsed.data;
  const supabase = await createSupabaseServerClient();

  const { data: openPeriod, error: openError } = await supabase
    .from("employee_draw_periods")
    .select("id, effective_from, notes")
    .eq("profile_id", profileId)
    .is("effective_to", null)
    .maybeSingle();

  if (openError) return mutationErrorState(openError, "draw");

  if (!openPeriod) {
    return failureState("This employee is not currently on draw.");
  }

  if (effectiveTo < openPeriod.effective_from) {
    return failureState(
      "The end date cannot be before the start of the current draw period.",
    );
  }

  const { error } = await supabase
    .from("employee_draw_periods")
    .update({
      effective_to: effectiveTo,
      notes: notes ?? openPeriod.notes,
    })
    .eq("id", openPeriod.id);

  if (error) return mutationErrorState(error, "draw");

  revalidateDraw();

  return successState(
    "Draw period closed. The history is preserved, and any outstanding balance stays on the draw ledger.",
  );
}

export async function createDrawAdvance(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:draw");
  if ("denied" in auth) return auth.denied;

  const parsed = drawAdvanceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, amount, reason, jobId } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("employee_draw_ledger").insert({
    profile_id: profileId,
    job_id: jobId,
    transaction_type: "draw_advance",
    amount: roundMoney(amount),
    reason,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "draw");

  revalidateDraw();

  return successState("Draw advance recorded against the employee's outstanding draw.");
}

export async function createDrawAdjustment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:draw");
  if ("denied" in auth) return auth.denied;

  const parsed = ledgerAdjustmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, amount, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("employee_draw_ledger").insert({
    profile_id: profileId,
    transaction_type: "manual_adjustment",
    amount: roundMoney(amount),
    reason,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "draw");

  revalidateDraw();

  return successState("Draw ledger adjustment recorded.");
}

export async function createRolloverAdjustment(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:draw");
  if ("denied" in auth) return auth.denied;

  const parsed = ledgerAdjustmentSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const { profileId, amount, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("commission_rollover_ledger").insert({
    profile_id: profileId,
    transaction_type: "manual_adjustment",
    amount: roundMoney(amount),
    reason,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "rollover");

  revalidateDraw();

  return successState("Rollover ledger adjustment recorded.");
}
