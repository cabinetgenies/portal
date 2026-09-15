"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import {
  calculateNetCommissionPayable,
  hasLedgerEntryForEvent,
} from "@/lib/commission/engine";
import {
  drawBalanceFromRows,
  getJobCommissionContext,
  rolloverBalanceFromRows,
} from "@/lib/commission/event-queries";
import { roundMoney, toNumber } from "@/lib/commission/financials";
import { isCommissionEventType, type CommissionEventType } from "@/lib/commission/types";
import {
  failureState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CommissionEventRow,
  CommissionRolloverLedgerRow,
  EmployeeDrawLedgerRow,
} from "@/lib/supabase/database.types";

/**
 * Commission event workflow.
 *
 *   accounting / admin / ceo : create and recalculate events, submit for approval
 *   admin / ceo              : approve, mark paid, void
 *
 * Idempotency
 *   * A job can hold at most one deposit event and one final true-up: enforced by
 *     a partial unique index in the database as well as by the checks below, so a
 *     retried request returns the existing state instead of creating a duplicate.
 *   * Offsets are posted once per event: enforced by the unique index on
 *     `(commission_event_id, transaction_type)` and checked before inserting, so a
 *     retried approval cannot double-apply draw or rollover.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function revalidateCommission(jobId?: string) {
  revalidatePath("/sales/commissions");
  revalidatePath("/sales/commissions/payments");
  revalidatePath("/sales/commissions/employees");
  revalidatePath("/projects");
  if (jobId) {
    revalidatePath(`/projects/${jobId}`);
  }
}

async function balancesForProfile(supabase: Supabase, profileId: string) {
  const [draw, rollover] = await Promise.all([
    supabase
      .from("employee_draw_ledger")
      .select("*")
      .eq("profile_id", profileId),
    supabase
      .from("commission_rollover_ledger")
      .select("*")
      .eq("profile_id", profileId),
  ]);

  return {
    draw: drawBalanceFromRows((draw.data ?? []) as EmployeeDrawLedgerRow[]),
    rollover: rolloverBalanceFromRows(
      (rollover.data ?? []) as CommissionRolloverLedgerRow[],
    ),
  };
}

async function createEventForJob({
  jobId,
  eventType,
  createdBy,
}: {
  jobId: string;
  eventType: Extract<CommissionEventType, "deposit" | "final_true_up">;
  createdBy: string;
}): Promise<ActionState> {
  const context = await getJobCommissionContext(jobId);

  if (!context) {
    return failureState("That job is not available to you.");
  }

  const { job, plan, planVersion, designer } = context.detail;
  // Set once a finalized audit is found: a final true-up is based on that snapshot,
  // never on the live figures, and never on a GP audit date alone.
  let finalizedAudit: { id: string; revision: number } | null = null;

  if (!designer || !job.sales_designer_id) {
    return failureState("Assign a sales designer to this job before calculating commission.");
  }

  if (!job.compensation_plan_version_id || !planVersion) {
    return failureState(
      "This job has no compensation plan version attached. An administrator must attach one before commission can be calculated.",
    );
  }

  if (plan && plan.participant_kind !== "sales_designer") {
    return failureState(
      "A job can only carry a sales designer compensation plan, so no event was created.",
    );
  }

  if (eventType === "deposit") {
    if (!job.deposit_received_date) {
      return failureState(
        "Record the deposit received date on the job before calculating the deposit commission.",
      );
    }

    if (context.hasDepositEvent) {
      return {
        status: "success",
        message: "A deposit commission event already exists for this job, so nothing was created.",
      };
    }
  }

  if (eventType === "final_true_up") {
    const auditClient = await createSupabaseServerClient();
    const { data: auditRows, error: auditError } = await auditClient
      .from("commission_audits")
      .select("id, revision")
      .eq("job_id", job.id)
      .eq("status", "finalized")
      .order("revision", { ascending: false })
      .limit(1);

    if (auditError) return mutationErrorState(auditError, "audit");

    const audit = auditRows?.[0] ?? null;

    if (!audit) {
      return failureState(
        "The final true-up uses the finalized commission audit. Open the Final audit section on this job, review the figures and finalize the audit first — a GP audit date on its own is not enough.",
      );
    }

    finalizedAudit = { id: audit.id, revision: audit.revision };

    if (!context.finalEligible) {
      return failureState(
        "Record the GP audit completion date (or move the job to GP audited) before calculating the final true-up.",
      );
    }

    if (context.hasFinalEvent) {
      return {
        status: "success",
        message: "A final true-up already exists for this job, so nothing was created.",
      };
    }
  }

  const calculation =
    eventType === "deposit" ? context.projected : context.finalCalculation;

  if (!calculation) {
    return failureState(
      "No commission tier configuration was found for the plan version attached to this job.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("commission_events")
    .insert({
      job_id: job.id,
      profile_id: job.sales_designer_id,
      event_type: eventType,
      calculation_stage: eventType === "deposit" ? "projected" : "final",
      compensation_plan_id: job.compensation_plan_id ?? "",
      compensation_plan_version_id: job.compensation_plan_version_id,
      commissionable_gp: roundMoney(toNumber(job.commissionable_gross_profit)),
      commissionable_gp_percent: toNumber(job.commissionable_gp_percent),
      tier_label: calculation.tier?.label ?? null,
      standard_commission_rate: calculation.standardRate,
      draw_rate_reduction: calculation.drawReductionApplied,
      effective_commission_rate: calculation.effectiveRate,
      job_gross_commission: calculation.jobGrossCommission,
      deposit_payout_percent: calculation.depositPayoutPercent,
      gross_commission: calculation.grossCommission,
      previously_recognized: calculation.previouslyRecognized,
      rollover_offset: calculation.rolloverOffset,
      draw_offset: calculation.drawOffset,
      net_payable: calculation.netPayable,
      status: "pending_approval",
      calculation_metadata: {
        calculated_at: new Date().toISOString(),
        plan_version_name: planVersion.version_name,
        tier_label: calculation.tier?.label ?? null,
        commissionable_gp: roundMoney(toNumber(job.commissionable_gross_profit)),
        commissionable_gp_percent: toNumber(job.commissionable_gp_percent),
        on_draw: context.onDraw,
        draw_balance: context.drawBalance,
        rollover_balance: context.rolloverBalance,
        previously_recognized: calculation.previouslyRecognized,
        settings: context.settings
          ? {
              deposit_payout_percent: context.settings.depositPayoutPercent,
              draw_rate_reduction: context.settings.drawRateReduction,
              draw_enabled: context.settings.drawEnabled,
              effective_from: context.settings.effectiveFrom,
            }
          : null,
        warnings: calculation.warnings,
        audit: finalizedAudit
          ? { id: finalizedAudit.id, revision: finalizedAudit.revision }
          : null,
      },
      created_by: createdBy,
    })
    .select("id, net_payable, gross_commission")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        status: "success",
        message: "This commission event already exists, so nothing was created.",
      };
    }

    return mutationErrorState(error, "commission_event");
  }

  revalidateCommission(job.id);

  const amounts =
    eventType === "deposit"
      ? `Deposit commission of $${toNumber(data?.gross_commission).toFixed(2)} created for approval.`
      : toNumber(data?.gross_commission) < 0
        ? `Final true-up of $${toNumber(data?.gross_commission).toFixed(2)} created. Approving it will add $${Math.abs(toNumber(data?.gross_commission)).toFixed(2)} to the rollover balance.`
        : `Final true-up of $${toNumber(data?.net_payable).toFixed(2)} payable created for approval.`;

  return { status: "success", message: amounts };
}

export async function createDepositCommissionEvent(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("calculate:commission");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return failureState("A job is required.");

  return createEventForJob({
    jobId,
    eventType: "deposit",
    createdBy: auth.userId,
  });
}

export async function createFinalTrueUpEvent(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("calculate:commission");
  if ("denied" in auth) return auth.denied;

  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return failureState("A job is required.");

  return createEventForJob({
    jobId,
    eventType: "final_true_up",
    createdBy: auth.userId,
  });
}

async function loadEvent(supabase: Supabase, eventId: string) {
  const { data, error } = await supabase
    .from("commission_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    return { event: null, error };
  }

  return { event: data as CommissionEventRow | null, error: null };
}

export async function submitCommissionEvent(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("submit:commission");
  if ("denied" in auth) return auth.denied;

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return failureState("A commission event is required.");

  const supabase = await createSupabaseServerClient();
  const { event, error } = await loadEvent(supabase, eventId);

  if (error) return mutationErrorState(error, "commission_event");
  if (!event) return failureState("That commission event is not available to you.");

  if (event.status === "pending_approval") {
    return { status: "success", message: "This event is already awaiting approval." };
  }

  if (event.status !== "calculated") {
    return failureState("Only a calculated event can be submitted for approval.");
  }

  const { error: updateError } = await supabase
    .from("commission_events")
    .update({ status: "pending_approval" })
    .eq("id", eventId);

  if (updateError) return mutationErrorState(updateError, "commission_event");

  revalidateCommission(event.job_id);

  return { status: "success", message: "Submitted for approval." };
}

export async function approveCommissionEvent(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("approve:commission");
  if ("denied" in auth) return auth.denied;

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return failureState("A commission event is required.");

  const supabase = await createSupabaseServerClient();
  const { event, error } = await loadEvent(supabase, eventId);

  if (error) return mutationErrorState(error, "commission_event");
  if (!event) return failureState("That commission event is not available to you.");

  if (event.status === "approved" || event.status === "paid") {
    return { status: "success", message: "This event is already approved." };
  }

  if (event.status !== "pending_approval") {
    return failureState("Only an event awaiting approval can be approved.");
  }

  const balances = await balancesForProfile(supabase, event.profile_id);
  const grossCommission = toNumber(event.gross_commission);
  const [drawEntries, rolloverEntries] = await Promise.all([
    supabase
      .from("employee_draw_ledger")
      .select("commission_event_id, transaction_type")
      .eq("commission_event_id", eventId),
    supabase
      .from("commission_rollover_ledger")
      .select("commission_event_id, transaction_type")
      .eq("commission_event_id", eventId),
  ]);

  const drawLedgerEntries = (drawEntries.data ?? []) as {
    commission_event_id: string | null;
    transaction_type: string;
  }[];
  const rolloverLedgerEntries = (rolloverEntries.data ?? []) as {
    commission_event_id: string | null;
    transaction_type: string;
  }[];

  let rolloverOffset = 0;
  let drawOffset = 0;
  let netPayable = 0;
  let rolloverObligation = 0;

  if (grossCommission < 0) {
    rolloverObligation = roundMoney(-grossCommission);
  } else {
    const applied = calculateNetCommissionPayable({
      amount: grossCommission,
      outstandingRollover: balances.rollover,
      outstandingDraw: balances.draw,
    });
    rolloverOffset = applied.rolloverOffset;
    drawOffset = applied.drawOffset;
    netPayable = applied.payable;
  }

  const eventTypeLabel = isCommissionEventType(event.event_type)
    ? event.event_type
    : "manual_adjustment";
  const reason = `Commission event ${eventId} (${eventTypeLabel}) for job ${event.job_id}`;

  // Post the ledger first: if the event update then fails, a retry finds the
  // ledger entries already present and simply finishes the approval.
  if (rolloverObligation > 0) {
    if (
      !hasLedgerEntryForEvent(
        rolloverLedgerEntries.map((entry) => ({
          commissionEventId: entry.commission_event_id,
          transactionType: entry.transaction_type,
        })),
        eventId,
        "negative_true_up",
      )
    ) {
      const { error: rolloverError } = await supabase
        .from("commission_rollover_ledger")
        .insert({
          profile_id: event.profile_id,
          job_id: event.job_id,
          commission_event_id: eventId,
          transaction_type: "negative_true_up",
          amount: rolloverObligation,
          reason: `${reason} — negative true-up carried forward`,
          created_by: auth.userId,
        });

      if (rolloverError) return mutationErrorState(rolloverError, "rollover");
    }
  }

  if (rolloverOffset > 0) {
    if (
      !hasLedgerEntryForEvent(
        rolloverLedgerEntries.map((entry) => ({
          commissionEventId: entry.commission_event_id,
          transactionType: entry.transaction_type,
        })),
        eventId,
        "future_commission_offset",
      )
    ) {
      const { error: offsetError } = await supabase
        .from("commission_rollover_ledger")
        .insert({
          profile_id: event.profile_id,
          job_id: event.job_id,
          commission_event_id: eventId,
          transaction_type: "future_commission_offset",
          amount: -rolloverOffset,
          reason: `${reason} — rollover applied before payment`,
          created_by: auth.userId,
        });

      if (offsetError) return mutationErrorState(offsetError, "rollover");
    }
  }

  if (drawOffset > 0) {
    if (
      hasLedgerEntryForEvent(
        drawLedgerEntries.map((entry) => ({
          commissionEventId: entry.commission_event_id,
          transactionType: entry.transaction_type,
        })),
        eventId,
        "commission_offset",
      )
    ) {
      // Already applied by an earlier attempt.
    } else {
      const { error: drawError } = await supabase.from("employee_draw_ledger").insert({
        profile_id: event.profile_id,
        job_id: event.job_id,
        commission_event_id: eventId,
        transaction_type: "commission_offset",
        amount: -drawOffset,
        reason: `${reason} — draw balance recovered from commission`,
        created_by: auth.userId,
      });

      if (drawError) return mutationErrorState(drawError, "draw");
    }
  }

  const { error: updateError } = await supabase
    .from("commission_events")
    .update({
      status: "approved",
      approved_by: auth.userId,
      approved_at: new Date().toISOString(),
      rollover_offset: rolloverOffset,
      draw_offset: drawOffset,
      net_payable: netPayable,
    })
    .eq("id", eventId);

  if (updateError) return mutationErrorState(updateError, "commission_event");

  revalidateCommission(event.job_id);

  return {
    status: "success",
    message:
      rolloverObligation > 0
        ? `Approved. $${rolloverObligation.toFixed(2)} was added to the rollover balance instead of a negative payment.`
        : `Approved. $${netPayable.toFixed(2)} payable after $${rolloverOffset.toFixed(2)} rollover and $${drawOffset.toFixed(2)} draw applied.`,
  };
}

export async function markCommissionEventPaid(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("pay:commission");
  if ("denied" in auth) return auth.denied;

  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId) return failureState("A commission event is required.");

  const supabase = await createSupabaseServerClient();
  const { event, error } = await loadEvent(supabase, eventId);

  if (error) return mutationErrorState(error, "commission_event");
  if (!event) return failureState("That commission event is not available to you.");

  if (event.status === "paid") {
    return { status: "success", message: "This event is already marked paid." };
  }

  if (event.status !== "approved") {
    return failureState("Only an approved event can be marked paid.");
  }

  const { error: updateError } = await supabase
    .from("commission_events")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", eventId);

  if (updateError) return mutationErrorState(updateError, "commission_event");

  revalidateCommission(event.job_id);

  return { status: "success", message: "Marked paid." };
}

export async function voidCommissionEvent(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("void:commission");
  if ("denied" in auth) return auth.denied;

  const eventId = String(formData.get("eventId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!eventId) return failureState("A commission event is required.");
  if (reason.length < 3) {
    return failureState("A reason is required to void a commission event.");
  }

  const supabase = await createSupabaseServerClient();
  const { event, error } = await loadEvent(supabase, eventId);

  if (error) return mutationErrorState(error, "commission_event");
  if (!event) return failureState("That commission event is not available to you.");

  if (event.status === "paid") {
    return failureState(
      "A paid commission event cannot be voided. Record an adjustment or rollover correction instead.",
    );
  }

  if (event.status === "voided") {
    return { status: "success", message: "This event is already voided." };
  }

  // Reverse anything this event already posted, so the ledgers stay truthful.
  const [drawEntries, rolloverEntries] = await Promise.all([
    supabase.from("employee_draw_ledger").select("*").eq("commission_event_id", eventId),
    supabase
      .from("commission_rollover_ledger")
      .select("*")
      .eq("commission_event_id", eventId),
  ]);

  const drawRows = (drawEntries.data ?? []) as EmployeeDrawLedgerRow[];
  const rolloverRows = (rolloverEntries.data ?? []) as CommissionRolloverLedgerRow[];
  const reversalReason = `Reversal of voided commission event ${eventId}: ${reason}`;

  for (const row of drawRows) {
    const { error: reversalError } = await supabase
      .from("employee_draw_ledger")
      .insert({
        profile_id: row.profile_id,
        job_id: row.job_id,
        transaction_type: "manual_adjustment",
        amount: roundMoney(-toNumber(row.amount)),
        reason: reversalReason,
        created_by: auth.userId,
      });

    if (reversalError) return mutationErrorState(reversalError, "draw");
  }

  for (const row of rolloverRows) {
    const { error: reversalError } = await supabase
      .from("commission_rollover_ledger")
      .insert({
        profile_id: row.profile_id,
        job_id: row.job_id,
        transaction_type: "manual_adjustment",
        amount: roundMoney(-toNumber(row.amount)),
        reason: reversalReason,
        created_by: auth.userId,
      });

    if (reversalError) return mutationErrorState(reversalError, "rollover");
  }

  const { error: updateError } = await supabase
    .from("commission_events")
    .update({
      status: "voided",
      void_reason: reason,
      voided_by: auth.userId,
      voided_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (updateError) return mutationErrorState(updateError, "commission_event");

  revalidateCommission(event.job_id);

  return {
    status: "success",
    message:
      drawRows.length + rolloverRows.length > 0
        ? "Event voided and its ledger offsets reversed."
        : "Event voided.",
  };
}
