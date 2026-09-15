export const JOB_STATUSES = [
  "presale",
  "sold",
  "active",
  "substantially_complete",
  "gp_audit_required",
  "gp_audited",
  "closed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  presale: "Presale",
  sold: "Sold",
  active: "Active",
  substantially_complete: "Substantially complete",
  gp_audit_required: "GP audit required",
  gp_audited: "GP audited",
  closed: "Closed",
  cancelled: "Cancelled",
};

export type StatusTone = "neutral" | "info" | "positive" | "warning" | "critical";

export const JOB_STATUS_TONES: Record<JobStatus, StatusTone> = {
  presale: "neutral",
  sold: "info",
  active: "info",
  substantially_complete: "info",
  gp_audit_required: "warning",
  gp_audited: "positive",
  closed: "positive",
  cancelled: "critical",
};

export const ADJUSTMENT_TYPES = [
  "revenue",
  "cost",
  "commissionable_revenue",
  "commissionable_cost",
] as const;

export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  revenue: "Revenue adjustment",
  cost: "Cost adjustment",
  commissionable_revenue: "Excluded revenue (commissionable)",
  commissionable_cost: "Excluded cost (commissionable)",
};

export const ADJUSTMENT_TYPE_HINTS: Record<AdjustmentType, string> = {
  revenue: "Adds to or subtracts from total job revenue. Use a negative amount to reduce.",
  cost: "Adds to or subtracts from total job cost. Use a negative amount to reduce.",
  commissionable_revenue:
    "Moves revenue out of (or into) the commissionable base. A negative amount excludes revenue from commissions.",
  commissionable_cost:
    "Moves cost out of (or into) the commissionable base. A negative amount excludes cost from commissions.",
};

/**
 * The revenue and cost inputs a job is built from. Money only — these are the
 * numbers accounting enters, and they are independent of commission rules.
 */
/**
 * The inputs a job's financials are calculated from.
 *
 * Direct costs are entered. Burden and warranty / service contingency are
 * *percentages* of direct job cost and their dollar amounts are derived by
 * `computeJobFinancials`. Percentages are decimal shares (0.1 = 10%) and are
 * always resolved before reaching this type: from the job's own snapshot when it
 * has one, otherwise from the company default in `commission_settings`.
 */
export type JobFinancialInputs = {
  contractRevenue: number;
  changeOrderRevenue: number;
  creditAmount: number;
  otherRevenue: number;
  materialCost: number;
  laborCost: number;
  subcontractorCost: number;
  otherDirectCost: number;
  burdenPercent: number;
  warrantyContingencyPercent: number;
};

export type JobAdjustmentInput = {
  adjustmentType: AdjustmentType;
  amount: number;
};

/** Everything derived from the inputs above, in one shape. */
export type JobFinancialResults = {
  /** material + labor + subcontractor + other direct — the base for both rates. */
  directJobCost: number;
  /** Derived: directJobCost x burdenPercent, rounded to cents. */
  burdenCost: number;
  /** Derived: directJobCost x warrantyContingencyPercent, rounded to cents. */
  warrantyServiceContingency: number;
  /** The rates those amounts were derived from, echoed for snapshotting. */
  burdenPercent: number;
  warrantyContingencyPercent: number;
  actualTotalRevenue: number;
  actualTotalCost: number;
  jobGrossProfit: number;
  jobGpPercent: number;
  commissionableRevenue: number;
  commissionableCost: number;
  commissionableGrossProfit: number;
  commissionableGpPercent: number;
};

export const EMPTY_JOB_FINANCIAL_INPUTS: JobFinancialInputs = {
  contractRevenue: 0,
  changeOrderRevenue: 0,
  creditAmount: 0,
  otherRevenue: 0,
  materialCost: 0,
  laborCost: 0,
  subcontractorCost: 0,
  otherDirectCost: 0,
  burdenPercent: 0,
  warrantyContingencyPercent: 0,
};

/** Narrows a stored string status to the constrained set. */
export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value);
}

export function jobStatusLabel(value: string | null | undefined): string {
  return isJobStatus(value) ? JOB_STATUS_LABELS[value] : "Unknown";
}

export function jobStatusTone(value: string | null | undefined): StatusTone {
  return isJobStatus(value) ? JOB_STATUS_TONES[value] : "neutral";
}

export function isAdjustmentType(value: unknown): value is AdjustmentType {
  return (
    typeof value === "string" && (ADJUSTMENT_TYPES as readonly string[]).includes(value)
  );
}


// ---------------------------------------------------------------------------
// Commission events, payout stages and ledger vocabulary
// ---------------------------------------------------------------------------

export const COMMISSION_EVENT_TYPES = [
  "deposit",
  "final_true_up",
  "manual_adjustment",
  "rollover_application",
] as const;

export type CommissionEventType = (typeof COMMISSION_EVENT_TYPES)[number];

export const COMMISSION_EVENT_TYPE_LABELS: Record<CommissionEventType, string> = {
  deposit: "Deposit commission",
  final_true_up: "Final true-up",
  manual_adjustment: "Manual adjustment",
  rollover_application: "Rollover application",
};

export const CALCULATION_STAGES = ["projected", "final"] as const;

export type CalculationStage = (typeof CALCULATION_STAGES)[number];

export const CALCULATION_STAGE_LABELS: Record<CalculationStage, string> = {
  projected: "Projected",
  final: "Final (audited)",
};

export const COMMISSION_EVENT_STATUSES = [
  "calculated",
  "pending_approval",
  "approved",
  "paid",
  "voided",
] as const;

export type CommissionEventStatus = (typeof COMMISSION_EVENT_STATUSES)[number];

export const COMMISSION_EVENT_STATUS_LABELS: Record<CommissionEventStatus, string> = {
  calculated: "Calculated",
  pending_approval: "Pending approval",
  approved: "Approved / awaiting payment",
  paid: "Paid",
  voided: "Voided",
};

export const COMMISSION_EVENT_STATUS_TONES: Record<CommissionEventStatus, StatusTone> = {
  calculated: "neutral",
  pending_approval: "warning",
  approved: "info",
  paid: "positive",
  voided: "critical",
};

export function isCommissionEventType(value: unknown): value is CommissionEventType {
  return (
    typeof value === "string" &&
    (COMMISSION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function isCommissionEventStatus(
  value: unknown,
): value is CommissionEventStatus {
  return (
    typeof value === "string" &&
    (COMMISSION_EVENT_STATUSES as readonly string[]).includes(value)
  );
}

export function commissionEventTypeLabel(value: string | null | undefined) {
  return isCommissionEventType(value) ? COMMISSION_EVENT_TYPE_LABELS[value] : "Unknown";
}

export function commissionEventStatusLabel(value: string | null | undefined) {
  return isCommissionEventStatus(value)
    ? COMMISSION_EVENT_STATUS_LABELS[value]
    : "Unknown";
}

export function commissionEventStatusTone(
  value: string | null | undefined,
): StatusTone {
  return isCommissionEventStatus(value) ? COMMISSION_EVENT_STATUS_TONES[value] : "neutral";
}

export const DRAW_TRANSACTION_TYPES = [
  "draw_advance",
  "commission_offset",
  "manual_adjustment",
  "repayment",
] as const;

export type DrawTransactionType = (typeof DRAW_TRANSACTION_TYPES)[number];

export const DRAW_TRANSACTION_TYPE_LABELS: Record<DrawTransactionType, string> = {
  draw_advance: "Draw advance",
  commission_offset: "Commission offset",
  manual_adjustment: "Manual adjustment",
  repayment: "Repayment",
};

export const ROLLOVER_TRANSACTION_TYPES = [
  "negative_true_up",
  "future_commission_offset",
  "manual_adjustment",
] as const;

export type RolloverTransactionType = (typeof ROLLOVER_TRANSACTION_TYPES)[number];

export const ROLLOVER_TRANSACTION_TYPE_LABELS: Record<RolloverTransactionType, string> = {
  negative_true_up: "Negative true-up",
  future_commission_offset: "Future commission offset",
  manual_adjustment: "Manual adjustment",
};

export function isDrawTransactionType(value: unknown): value is DrawTransactionType {
  return (
    typeof value === "string" &&
    (DRAW_TRANSACTION_TYPES as readonly string[]).includes(value)
  );
}

export function isRolloverTransactionType(
  value: unknown,
): value is RolloverTransactionType {
  return (
    typeof value === "string" &&
    (ROLLOVER_TRANSACTION_TYPES as readonly string[]).includes(value)
  );
}
