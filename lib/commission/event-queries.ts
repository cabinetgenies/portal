import { cache } from "react";

import {
  calculateCommissionEvent,
  calculateOutstandingDrawBalance,
  calculateOutstandingRolloverBalance,
  hasEventOfType,
  previouslyRecognizedCommission,
  type CommissionEventCalculation,
  type CommissionSettingsSnapshot,
} from "@/lib/commission/engine";
import { toNumber } from "@/lib/commission/financials";
import type { TierWindow } from "@/lib/compensation/plan-resolution";
import {
  isCommissionEventType,
  type CalculationStage,
  type CommissionEventType,
  type DrawTransactionType,
  type RolloverTransactionType,
} from "@/lib/commission/types";
import { getJobDetail, type JobDetail } from "@/lib/commission/queries";
import type {
  CommissionEventRow,
  CompensationPlanTierRow,
  CommissionRolloverLedgerRow,
  CommissionSettingsRow,
  CompensationPlanRow,
  CompensationPlanVersionRow,
  EmployeeCompensationAssignmentRow,
  EmployeeCompensationSettingsRow,
  EmployeeDrawLedgerRow,
  EmployeeDrawPeriodRow,
  JobRow,
  ProfileRow,
} from "@/lib/supabase/database.types";
import { unwrap } from "@/lib/supabase/results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read layer for the commission engine: settings, events, ledgers and the derived
 * balances the UI and the Server Actions both need.
 *
 * Balances are always derived from the append-only ledgers through the canonical
 * engine functions, never stored as a single number.
 */

export type CommissionSettings = {
  id: string;
  effectiveFrom: string;
  depositPayoutPercent: number;
  drawRateReduction: number;
  drawEnabled: boolean;
  notes: string | null;
};

export const DEFAULT_COMMISSION_SETTINGS: CommissionSettingsSnapshot = {
  depositPayoutPercent: 0.5,
  drawRateReduction: 0.05,
  drawEnabled: true,
};

function mapSettings(row: CommissionSettingsRow | null): CommissionSettings | null {
  if (!row) return null;

  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    depositPayoutPercent: toNumber(row.deposit_payout_percent),
    drawRateReduction: toNumber(row.draw_rate_reduction),
    drawEnabled: row.draw_enabled,
    notes: row.notes,
  };
}

export function settingsSnapshot(
  settings: CommissionSettings | null,
): CommissionSettingsSnapshot {
  if (!settings) {
    return DEFAULT_COMMISSION_SETTINGS;
  }

  return {
    depositPayoutPercent: settings.depositPayoutPercent,
    drawRateReduction: settings.drawRateReduction,
    drawEnabled: settings.drawEnabled,
  };
}

/** The commission settings in force today. */
export const getCommissionSettings = cache(async function getCommissionSettings() {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("commission_settings")
    .select("*")
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Query failed (commission settings):", error.message);
    throw new Error("Could not load commission settings.");
  }

  return mapSettings(data);
});

/** Full settings history, newest first. */
export const listCommissionSettingsHistory = cache(
  async function listCommissionSettingsHistory() {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from("commission_settings")
      .select("*")
      .order("effective_from", { ascending: false });

    return unwrap<CommissionSettingsRow[]>(result, "commission settings").map(
      (row) => mapSettings(row) as CommissionSettings,
    );
  },
);

export function toTierWindow(row: CompensationPlanTierRow): TierWindow {
  return {
    sortOrder: row.sort_order,
    label: row.label,
    rate: toNumber(row.rate),
    lower: {
      thresholdType: row.lower_threshold_type as TierWindow["lower"]["thresholdType"],
      value: row.lower_gp_percent === null ? null : toNumber(row.lower_gp_percent),
    },
    upper: {
      thresholdType: row.upper_threshold_type as TierWindow["upper"]["thresholdType"],
      value: row.upper_gp_percent === null ? null : toNumber(row.upper_gp_percent),
    },
  };
}

// ---------------------------------------------------------------------------
// Ledger helpers (canonical balances)
// ---------------------------------------------------------------------------

export function drawBalanceFromRows(rows: readonly EmployeeDrawLedgerRow[]) {
  return calculateOutstandingDrawBalance(
    rows.map((row) => ({
      transactionType: row.transaction_type as DrawTransactionType,
      amount: toNumber(row.amount),
    })),
  );
}

export function rolloverBalanceFromRows(
  rows: readonly CommissionRolloverLedgerRow[],
) {
  return calculateOutstandingRolloverBalance(
    rows.map((row) => ({
      transactionType: row.transaction_type as RolloverTransactionType,
      amount: toNumber(row.amount),
    })),
  );
}

export function isOnDrawOn(periods: readonly EmployeeDrawPeriodRow[], onDate: string) {
  return periods.some(
    (period) =>
      period.effective_from <= onDate &&
      (period.effective_to === null || period.effective_to >= onDate),
  );
}

export function eventTypeOf(row: CommissionEventRow): CommissionEventType | null {
  return isCommissionEventType(row.event_type) ? row.event_type : null;
}

export function recognizedFromEvents(rows: readonly CommissionEventRow[]) {
  return previouslyRecognizedCommission(
    rows
      .filter((row) => isCommissionEventType(row.event_type))
      .map((row) => ({
        eventType: row.event_type as CommissionEventType,
        status: row.status,
        netPayable: toNumber(row.net_payable),
      })),
  );
}

// ---------------------------------------------------------------------------
// Workspace: everything the commission screens need, loaded once per request
// ---------------------------------------------------------------------------

export type CommissionWorkspace = {
  settings: CommissionSettings | null;
  profiles: ProfileRow[];
  jobs: JobRow[];
  events: CommissionEventRow[];
  drawPeriods: EmployeeDrawPeriodRow[];
  drawLedger: EmployeeDrawLedgerRow[];
  rolloverLedger: CommissionRolloverLedgerRow[];
  compensationSettings: EmployeeCompensationSettingsRow[];
  assignments: EmployeeCompensationAssignmentRow[];
  planVersions: CompensationPlanVersionRow[];
  planTiers: CompensationPlanTierRow[];
  plans: CompensationPlanRow[];
};

export const loadCommissionWorkspace = cache(async function loadCommissionWorkspace() {
  const supabase = await createSupabaseServerClient();

  const [
    settings,
    profiles,
    jobs,
    events,
    drawPeriods,
    drawLedger,
    rolloverLedger,
    compensationSettings,
    assignments,
    planVersions,
    planTiers,
    plans,
  ] = await Promise.all([
    getCommissionSettings(),
    supabase.from("profiles").select("*").order("first_name", { ascending: true }),
    supabase.from("jobs").select("*").order("created_at", { ascending: false }),
    supabase.from("commission_events").select("*").order("created_at", { ascending: false }),
    supabase.from("employee_draw_periods").select("*").order("effective_from", { ascending: false }),
    supabase.from("employee_draw_ledger").select("*").order("created_at", { ascending: false }),
    supabase
      .from("commission_rollover_ledger")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("employee_compensation_settings").select("*"),
    supabase
      .from("employee_compensation_assignments")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabase.from("compensation_plan_versions").select("*"),
    supabase.from("compensation_plan_tiers").select("*").order("sort_order", { ascending: true }),
    supabase.from("compensation_plans").select("*"),
  ]);

  return {
    settings,
    profiles: unwrap<ProfileRow[]>(profiles, "profiles"),
    jobs: unwrap<JobRow[]>(jobs, "jobs"),
    events: unwrap<CommissionEventRow[]>(events, "commission events"),
    drawPeriods: unwrap<EmployeeDrawPeriodRow[]>(drawPeriods, "draw periods"),
    drawLedger: unwrap<EmployeeDrawLedgerRow[]>(drawLedger, "draw ledger"),
    rolloverLedger: unwrap<CommissionRolloverLedgerRow[]>(
      rolloverLedger,
      "rollover ledger",
    ),
    compensationSettings: unwrap<EmployeeCompensationSettingsRow[]>(
      compensationSettings,
      "compensation settings",
    ),
    assignments: unwrap<EmployeeCompensationAssignmentRow[]>(
      assignments,
      "compensation assignments",
    ),
    planVersions: unwrap<CompensationPlanVersionRow[]>(planVersions, "plan versions"),
    planTiers: unwrap<CompensationPlanTierRow[]>(planTiers, "plan tiers"),
    plans: unwrap<CompensationPlanRow[]>(plans, "compensation plans"),
  } satisfies CommissionWorkspace;
});

export function tiersForVersion(
  workspace: Pick<CommissionWorkspace, "planTiers">,
  planVersionId: string | null,
) {
  if (!planVersionId) return [];

  return workspace.planTiers
    .filter((tier) => tier.compensation_plan_version_id === planVersionId)
    .map(toTierWindow);
}

export function jobsForProfile(workspace: CommissionWorkspace, profileId: string) {
  return workspace.jobs.filter((job) => job.sales_designer_id === profileId);
}

export function eventsForJob(workspace: CommissionWorkspace, jobId: string) {
  return workspace.events.filter((event) => event.job_id === jobId);
}

export function eventsForProfile(workspace: CommissionWorkspace, profileId: string) {
  return workspace.events.filter((event) => event.profile_id === profileId);
}

/**
 * Projected gross commission for a job from its *current* commissionable
 * financials. Uses the same engine as the server actions.
 */
export function projectedCommissionForJob(
  workspace: CommissionWorkspace,
  job: JobRow,
): CommissionEventCalculation | null {
  if (!job.sales_designer_id || !job.compensation_plan_version_id) {
    return null;
  }

  const tiers = tiersForVersion(workspace, job.compensation_plan_version_id);

  if (tiers.length === 0) {
    return null;
  }

  const designerPeriods = workspace.drawPeriods.filter(
    (period) => period.profile_id === job.sales_designer_id,
  );
  const referenceDate =
    job.deposit_received_date ?? job.sold_date ?? new Date().toISOString().slice(0, 10);
  const designerDrawRows = workspace.drawLedger.filter(
    (row) => row.profile_id === job.sales_designer_id,
  );
  const designerRolloverRows = workspace.rolloverLedger.filter(
    (row) => row.profile_id === job.sales_designer_id,
  );
  const events = eventsForJob(workspace, job.id);

  return calculateCommissionEvent({
    jobId: job.id,
    profileId: job.sales_designer_id,
    eventType: "deposit",
    stage: "projected",
    commissionableGp: toNumber(job.commissionable_gross_profit),
    commissionableGpPercent: toNumber(job.commissionable_gp_percent),
    tiers,
    minimumGpStandard: 0,
    plan: {
      planId: job.compensation_plan_id ?? "",
      planVersionId: job.compensation_plan_version_id,
      versionName: null,
    },
    settings: settingsSnapshot(workspace.settings),
    onDraw: isOnDrawOn(designerPeriods, referenceDate),
    outstandingRollover: rolloverBalanceFromRows(designerRolloverRows),
    outstandingDraw: drawBalanceFromRows(designerDrawRows),
    previouslyRecognized: recognizedFromEvents(events),
  });
}

export function isJobCommissionalbe(job: JobRow) {
  return job.status !== "cancelled";
}

export type JobCommissionContext = {
  detail: JobDetail;
  settings: CommissionSettings | null;
  onDraw: boolean;
  drawBalance: number;
  rolloverBalance: number;
  events: CommissionEventRow[];
  previouslyRecognized: number;
  projected: CommissionEventCalculation | null;
  finalCalculation: CommissionEventCalculation | null;
  hasDepositEvent: boolean;
  hasFinalEvent: boolean;
  depositEligible: boolean;
  finalEligible: boolean;
  /** True when the job has no plan version attached, so nothing can be calculated. */
  missingPlanVersion: boolean;
};

export const getJobCommissionContext = cache(async function getJobCommissionContext(
  jobId: string,
): Promise<JobCommissionContext | null> {
  const detail = await getJobDetail(jobId);

  if (!detail) {
    return null;
  }

  const workspace = await loadCommissionWorkspace();
  const { job } = detail;
  const designerId = job.sales_designer_id;
  const events = eventsForJob(workspace, job.id);
  const previouslyRecognized = recognizedFromEvents(events);
  const tiers = tiersForVersion(workspace, job.compensation_plan_version_id);

  const designerDrawRows = workspace.drawLedger.filter(
    (row) => row.profile_id === designerId,
  );
  const designerRolloverRows = workspace.rolloverLedger.filter(
    (row) => row.profile_id === designerId,
  );
  const drawBalance = drawBalanceFromRows(designerDrawRows);
  const rolloverBalance = rolloverBalanceFromRows(designerRolloverRows);
  const referenceDate =
    job.deposit_received_date ?? job.sold_date ?? new Date().toISOString().slice(0, 10);
  const onDraw = isOnDrawOn(
    workspace.drawPeriods.filter((period) => period.profile_id === designerId),
    referenceDate,
  );
  const settingsSnapshotValue = settingsSnapshot(workspace.settings);

  const buildCalculation = (eventType: CommissionEventType, stage: CalculationStage) =>
    designerId && job.compensation_plan_version_id && tiers.length > 0
      ? calculateCommissionEvent({
          jobId: job.id,
          profileId: designerId,
          eventType,
          stage,
          commissionableGp: toNumber(job.commissionable_gross_profit),
          commissionableGpPercent: toNumber(job.commissionable_gp_percent),
          tiers,
          minimumGpStandard: 0,
          plan: {
            planId: job.compensation_plan_id ?? "",
            planVersionId: job.compensation_plan_version_id,
            versionName: detail.planVersion?.version_name ?? null,
          },
          settings: settingsSnapshotValue,
          onDraw,
          outstandingRollover: rolloverBalance,
          outstandingDraw: drawBalance,
          previouslyRecognized,
        })
      : null;

  const depositEligible = job.deposit_received_date !== null;
  const finalEligible =
    job.gp_audit_completed_date !== null ||
    job.status === "gp_audited" ||
    job.status === "closed";

  return {
    detail,
    settings: workspace.settings,
    onDraw,
    drawBalance,
    rolloverBalance,
    events,
    previouslyRecognized,
    projected: buildCalculation("deposit", "projected"),
    finalCalculation: buildCalculation("final_true_up", "final"),
    hasDepositEvent: hasEventOfType(
      events
        .filter((event) => isCommissionEventType(event.event_type))
        .map((event) => ({
          eventType: event.event_type as CommissionEventType,
          status: event.status,
        })),
      "deposit",
    ),
    hasFinalEvent: hasEventOfType(
      events
        .filter((event) => isCommissionEventType(event.event_type))
        .map((event) => ({
          eventType: event.event_type as CommissionEventType,
          status: event.status,
        })),
      "final_true_up",
    ),
    depositEligible,
    finalEligible,
    missingPlanVersion: job.compensation_plan_version_id === null,
  };
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type CommissionQueueJob = {
  job: JobRow;
  designerName: string | null;
  projectedGrossCommission: number | null;
  depositTarget: number | null;
};

export type CommissionQueueEvent = {
  event: CommissionEventRow;
  jobName: string | null;
  designerName: string | null;
};

export type CommissionQueueRollover = {
  profile: ProfileRow;
  outstandingRollover: number;
};

export type CommissionDashboard = {
  cards: {
    projectedCommission: number;
    pendingApproval: number;
    approvedAwaitingPayment: number;
    paidThisMonth: number;
    outstandingDraw: number;
    outstandingRollover: number;
  };
  queues: {
    depositReady: CommissionQueueJob[];
    finalAuditsNeeded: CommissionQueueJob[];
    finalTrueUpsReady: CommissionQueueJob[];
    negativeTrueUps: CommissionQueueRollover[];
    paymentsAwaitingApproval: CommissionQueueEvent[];
  };
};

function profileName(profile: ProfileRow | undefined) {
  if (!profile) return null;

  const combined = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  return combined.length > 0 ? combined : profile.display_name ?? profile.email;
}

function hasOpenEvent(
  workspace: CommissionWorkspace,
  jobId: string,
  eventType: CommissionEventType,
) {
  return hasEventOfType(
    eventsForJob(workspace, jobId)
      .filter((event) => isCommissionEventType(event.event_type))
      .map((event) => ({
        eventType: event.event_type as CommissionEventType,
        status: event.status,
      })),
    eventType,
  );
}

export const getCommissionDashboard = cache(async function getCommissionDashboard() {
  const workspace = await loadCommissionWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const profilesById = new Map(workspace.profiles.map((profile) => [profile.id, profile]));

  const activeJobs = workspace.jobs.filter(isJobCommissionalbe);

  const projections = new Map<string, CommissionEventCalculation | null>();

  for (const job of activeJobs) {
    projections.set(job.id, projectedCommissionForJob(workspace, job));
  }

  let projectedCommission = 0;
  const depositReady: CommissionQueueJob[] = [];
  const finalAuditsNeeded: CommissionQueueJob[] = [];
  const finalTrueUpsReady: CommissionQueueJob[] = [];

  for (const job of activeJobs) {
    const projection = projections.get(job.id) ?? null;
    const hasFinal = hasOpenEvent(workspace, job.id, "final_true_up");

    if (!hasFinal) {
      projectedCommission += projection?.jobGrossCommission ?? 0;
    }

    const queueItem: CommissionQueueJob = {
      job,
      designerName: profileName(profilesById.get(job.sales_designer_id ?? "")),
      projectedGrossCommission: projection?.jobGrossCommission ?? null,
      depositTarget: projection?.grossCommission ?? null,
    };

    if (
      job.deposit_received_date !== null &&
      !hasOpenEvent(workspace, job.id, "deposit")
    ) {
      depositReady.push(queueItem);
    }

    const completionRecorded =
      job.completion_date !== null ||
      job.status === "substantially_complete" ||
      job.status === "gp_audit_required";

    if (completionRecorded && !hasFinal) {
      finalAuditsNeeded.push(queueItem);
    }

    const finalEligible =
      job.gp_audit_completed_date !== null ||
      job.status === "gp_audited" ||
      job.status === "closed";

    if (finalEligible && !hasFinal) {
      finalTrueUpsReady.push(queueItem);
    }
  }

  const drawBalanceByProfile = new Map<string, number>();
  const rolloverBalanceByProfile = new Map<string, number>();

  for (const profile of workspace.profiles) {
    drawBalanceByProfile.set(
      profile.id,
      drawBalanceFromRows(
        workspace.drawLedger.filter((row) => row.profile_id === profile.id),
      ),
    );
    rolloverBalanceByProfile.set(
      profile.id,
      rolloverBalanceFromRows(
        workspace.rolloverLedger.filter((row) => row.profile_id === profile.id),
      ),
    );
  }

  const outstandingDraw = [...drawBalanceByProfile.values()].reduce(
    (total, value) => total + value,
    0,
  );
  const outstandingRollover = [...rolloverBalanceByProfile.values()].reduce(
    (total, value) => total + value,
    0,
  );

  let pendingApproval = 0;
  let approvedAwaitingPayment = 0;
  let paidThisMonth = 0;
  const paymentsAwaitingApproval: CommissionQueueEvent[] = [];

  for (const event of workspace.events) {
    const netPayable = toNumber(event.net_payable);

    if (event.status === "pending_approval") {
      pendingApproval += netPayable;
      paymentsAwaitingApproval.push({
        event,
        jobName:
          workspace.jobs.find((job) => job.id === event.job_id)?.job_name ?? null,
        designerName: profileName(profilesById.get(event.profile_id)),
      });
    }

    if (event.status === "approved") {
      approvedAwaitingPayment += netPayable;
    }

    if (event.status === "paid" && (event.paid_at ?? "").startsWith(monthPrefix)) {
      paidThisMonth += netPayable;
    }
  }

  const negativeTrueUps = workspace.profiles
    .map<CommissionQueueRollover>((profile) => ({
      profile,
      outstandingRollover: rolloverBalanceByProfile.get(profile.id) ?? 0,
    }))
    .filter((entry) => entry.outstandingRollover > 0)
    .sort((a, b) => b.outstandingRollover - a.outstandingRollover);

  return {
    cards: {
      projectedCommission: Math.round(projectedCommission * 100) / 100,
      pendingApproval,
      approvedAwaitingPayment,
      paidThisMonth,
      outstandingDraw,
      outstandingRollover,
    },
    queues: {
      depositReady,
      finalAuditsNeeded,
      finalTrueUpsReady,
      negativeTrueUps,
      paymentsAwaitingApproval,
    },
  } satisfies CommissionDashboard;
});

// ---------------------------------------------------------------------------
// Employee summaries (the /commissions/employees table and its detail panels)
// ---------------------------------------------------------------------------

export type EmployeeCommissionSummary = {
  profile: ProfileRow;
  compensationEligible: boolean;
  compensationNotes: string | null;
  planName: string | null;
  onDraw: boolean;
  openDrawPeriodFrom: string | null;
  drawBalance: number;
  rolloverBalance: number;
  projectedCommission: number;
  pendingApproval: number;
  approvedUnpaid: number;
  paidYtd: number;
  events: CommissionEventRow[];
  drawPeriods: EmployeeDrawPeriodRow[];
  drawLedger: EmployeeDrawLedgerRow[];
  rolloverLedger: CommissionRolloverLedgerRow[];
};

export const listEmployeeCommissionSummaries = cache(
  async function listEmployeeCommissionSummaries() {
    const workspace = await loadCommissionWorkspace();
    const today = new Date().toISOString().slice(0, 10);
    const yearPrefix = today.slice(0, 4);
    const plansById = new Map(workspace.plans.map((plan) => [plan.id, plan]));

    return workspace.profiles.map<EmployeeCommissionSummary>((profile) => {
      const events = eventsForProfile(workspace, profile.id);
      const drawPeriods = workspace.drawPeriods.filter(
        (period) => period.profile_id === profile.id,
      );
      const drawLedger = workspace.drawLedger.filter(
        (row) => row.profile_id === profile.id,
      );
      const rolloverLedger = workspace.rolloverLedger.filter(
        (row) => row.profile_id === profile.id,
      );
      const currentAssignment = workspace.assignments.find((assignment) => {
        if (assignment.profile_id !== profile.id) return false;
        if (assignment.effective_from > today) return false;
        return assignment.effective_to === null || assignment.effective_to >= today;
      });
      const projectedCommission = jobsForProfile(workspace, profile.id)
        .filter((job) => isJobCommissionalbe(job))
        .filter((job) => !hasOpenEvent(workspace, job.id, "final_true_up"))
        .reduce(
          (total, job) =>
            total + (projectedCommissionForJob(workspace, job)?.jobGrossCommission ?? 0),
          0,
        );

      return {
        profile,
        compensationEligible:
          workspace.compensationSettings.find((row) => row.profile_id === profile.id)
            ?.compensation_eligible ?? false,
        compensationNotes:
          workspace.compensationSettings.find((row) => row.profile_id === profile.id)
            ?.notes ?? null,
        planName: currentAssignment
          ? plansById.get(currentAssignment.compensation_plan_id)?.name ?? null
          : null,
        onDraw: isOnDrawOn(drawPeriods, today),
        openDrawPeriodFrom:
          drawPeriods.find((period) => period.effective_to === null)?.effective_from ?? null,
        drawBalance: drawBalanceFromRows(drawLedger),
        rolloverBalance: rolloverBalanceFromRows(rolloverLedger),
        projectedCommission: Math.round(projectedCommission * 100) / 100,
        pendingApproval: events
          .filter((event) => event.status === "pending_approval")
          .reduce((total, event) => total + toNumber(event.net_payable), 0),
        approvedUnpaid: events
          .filter((event) => event.status === "approved")
          .reduce((total, event) => total + toNumber(event.net_payable), 0),
        paidYtd: events
          .filter(
            (event) =>
              event.status === "paid" && (event.paid_at ?? "").startsWith(yearPrefix),
          )
          .reduce((total, event) => total + toNumber(event.net_payable), 0),
        events,
        drawPeriods,
        drawLedger,
        rolloverLedger,
      };
    });
  },
);
