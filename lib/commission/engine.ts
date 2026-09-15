import {
  resolveTierForGpPercent,
  type TierWindow,
} from "@/lib/compensation/plan-resolution";
import { roundMoney, roundPercent } from "@/lib/commission/financials";
import type {
  CalculationStage,
  CommissionEventType,
  DrawTransactionType,
  RolloverTransactionType,
} from "@/lib/commission/types";

/**
 * The canonical Cabinet Genies commission engine.
 *
 * Every number the portal shows or stores for commission comes from these
 * functions — server actions, previews and the job detail panel all call the same
 * code, so the UI can never disagree with the ledger.
 *
 * Pipeline
 *   1. resolveCommissionTier   (configured tier from commissionable GP %)
 *   2. applyDrawRateReduction  (absolute subtraction when the employee is on draw)
 *   3. calculateGrossCommission (commissionable GP x effective rate)
 *   4. stage amount            (deposit payout, or final true-up vs recognized)
 *   5. apply offsets           (rollover obligation, then draw balance, then cash)
 *
 * No rate, percentage or threshold is hardcoded here: they arrive as arguments
 * from configuration and are snapshotted onto the resulting event.
 */

export type TierResolution = {
  rate: number;
  label: string | null;
  sortOrder: number;
};

/** The configured standard rate for a commissionable GP percentage (0 if none). */
export function calculateStandardCommissionRate(
  gpPercent: number,
  tiers: readonly TierWindow[],
  minimumGpStandard: number,
): number {
  return resolveCommissionTier(gpPercent, tiers, minimumGpStandard)?.rate ?? 0;
}

/** The configured tier for a commissionable GP percentage, if any matches. */
export function resolveCommissionTier(
  gpPercent: number,
  tiers: readonly TierWindow[],
  minimumGpStandard: number,
): TierResolution | null {
  const tier = resolveTierForGpPercent(tiers, gpPercent, minimumGpStandard);

  if (!tier) {
    return null;
  }

  return { rate: tier.rate, label: tier.label, sortOrder: tier.sortOrder };
}

export function calculateGrossCommission(commissionableGp: number, rate: number) {
  return roundMoney(commissionableGp * rate);
}

/**
 * Draw against commission lowers the rate by an absolute number of percentage
 * points (default 0.05), and the result never goes below zero. It is never a
 * multiplication of the standard rate.
 */
export function applyDrawRateReduction(standardRate: number, reduction: number) {
  const safeReduction = Math.max(0, reduction);

  return Math.max(0, roundPercent(standardRate - safeReduction));
}

/** Deposit payout: a configurable share of the projected gross commission. */
export function calculateDepositCommission(
  projectedGrossCommission: number,
  depositPayoutPercent: number,
) {
  return roundMoney(projectedGrossCommission * Math.max(0, depositPayoutPercent));
}

/**
 * Final true-up: final audited gross commission minus everything already
 * recognized against the job. Negative means the employee was overpaid on the
 * deposit, which becomes a rollover obligation rather than a negative payment.
 */
export function calculateFinalTrueUp(
  finalGrossCommission: number,
  previouslyRecognized: number,
) {
  return roundMoney(finalGrossCommission - previouslyRecognized);
}

export type BalanceApplication = {
  /** How much of the amount was absorbed by the balance. */
  offset: number;
  /** What is left of the amount after the offset. */
  remaining: number;
  /** The balance after the offset. */
  newBalance: number;
};

function applyBalance(amount: number, outstandingBalance: number): BalanceApplication {
  const available = Math.max(0, roundMoney(outstandingBalance));
  const requested = Math.max(0, roundMoney(amount));
  const offset = roundMoney(Math.min(requested, available));

  return {
    offset,
    remaining: roundMoney(requested - offset),
    newBalance: roundMoney(available - offset),
  };
}

/** Applies an outstanding rollover balance to an amount of earned commission. */
export function applyRolloverBalance(
  amount: number,
  outstandingRollover: number,
): BalanceApplication {
  return applyBalance(amount, outstandingRollover);
}

/** Applies an outstanding draw balance to an amount of earned commission. */
export function applyDrawBalance(
  amount: number,
  outstandingDraw: number,
): BalanceApplication {
  return applyBalance(amount, outstandingDraw);
}

export type NetCommissionPayable = {
  rolloverOffset: number;
  drawOffset: number;
  payable: number;
  remainingRollover: number;
  remainingDraw: number;
};

/**
 * The one canonical offset order for Cabinet Genies:
 *
 *   1. rollover obligation (money the employee already owes from a negative true-up)
 *   2. draw balance (advances already paid)
 *   3. whatever is left becomes payable cash commission
 *
 * Both server-side calculations and UI previews call this function.
 */
export function calculateNetCommissionPayable({
  amount,
  outstandingRollover = 0,
  outstandingDraw = 0,
}: {
  amount: number;
  outstandingRollover?: number;
  outstandingDraw?: number;
}): NetCommissionPayable {
  const rollover = applyRolloverBalance(amount, outstandingRollover);
  const draw = applyDrawBalance(rollover.remaining, outstandingDraw);

  return {
    rolloverOffset: rollover.offset,
    drawOffset: draw.offset,
    payable: draw.remaining,
    remainingRollover: rollover.newBalance,
    remainingDraw: draw.newBalance,
  };
}

/**
 * Outstanding draw balance from the append-only ledger.
 *
 * Sign convention: a positive amount increases the outstanding draw (an advance),
 * a negative amount reduces it (commission offset, repayment, manual correction).
 * This mirrors `public.employee_draw_balance(profile_id)` in SQL.
 */
export function calculateOutstandingDrawBalance(
  entries: readonly { transactionType: DrawTransactionType; amount: number }[],
) {
  return Math.max(
    0,
    roundMoney(entries.reduce((total, entry) => total + entry.amount, 0)),
  );
}

/**
 * Outstanding rollover balance from the append-only ledger.
 *
 * Sign convention: a positive amount increases what the employee owes (negative
 * true-up), a negative amount reduces it (future commission offset, manual
 * correction). This mirrors `public.employee_rollover_balance(profile_id)` in SQL.
 */
export function calculateOutstandingRolloverBalance(
  entries: readonly { transactionType: RolloverTransactionType; amount: number }[],
) {
  return Math.max(
    0,
    roundMoney(entries.reduce((total, entry) => total + entry.amount, 0)),
  );
}

export type CommissionSettingsSnapshot = {
  depositPayoutPercent: number;
  drawRateReduction: number;
  drawEnabled: boolean;
};

export type CommissionPlanSnapshot = {
  planId: string;
  planVersionId: string;
  versionName: string | null;
};

export type CommissionEventCalculationInput = {
  jobId: string;
  profileId: string;
  eventType: CommissionEventType;
  stage: CalculationStage;
  /** Commissionable gross profit (burden already included in cost). */
  commissionableGp: number;
  commissionableGpPercent: number;
  tiers: readonly TierWindow[];
  minimumGpStandard: number;
  plan: CommissionPlanSnapshot;
  settings: CommissionSettingsSnapshot;
  onDraw: boolean;
  outstandingRollover: number;
  outstandingDraw: number;
  previouslyRecognized: number;
  /** Required for manual adjustments; ignored for calculated event types. */
  manualAmount?: number;
};

export type CommissionEventCalculation = {
  tier: TierResolution | null;
  standardRate: number;
  drawReductionApplied: number;
  effectiveRate: number;
  jobGrossCommission: number;
  grossCommission: number;
  depositPayoutPercent: number;
  previouslyRecognized: number;
  rolloverOffset: number;
  drawOffset: number;
  netPayable: number;
  /** Amount added to the rollover ledger by a negative true-up. */
  rolloverObligation: number;
  remainingRollover: number;
  remainingDraw: number;
  warnings: string[];
};

export function calculateCommissionEvent(
  input: CommissionEventCalculationInput,
): CommissionEventCalculation {
  const warnings: string[] = [];
  const tier = resolveCommissionTier(
    input.commissionableGpPercent,
    input.tiers,
    input.minimumGpStandard,
  );

  if (!tier) {
    warnings.push(
      "No commission tier matched this gross-profit percentage, so the standard rate is 0%.",
    );
  }

  const standardRate = tier?.rate ?? 0;
  const drawReductionApplied =
    input.onDraw && input.settings.drawEnabled
      ? Math.max(0, input.settings.drawRateReduction)
      : 0;
  const effectiveRate = applyDrawRateReduction(standardRate, drawReductionApplied);
  const jobGrossCommission = calculateGrossCommission(
    input.commissionableGp,
    effectiveRate,
  );

  const depositPayoutPercent =
    input.eventType === "deposit" ? Math.max(0, input.settings.depositPayoutPercent) : 0;

  let grossCommission: number;

  switch (input.eventType) {
    case "deposit":
      grossCommission = calculateDepositCommission(
        jobGrossCommission,
        depositPayoutPercent,
      );
      break;
    case "final_true_up":
      grossCommission = calculateFinalTrueUp(
        jobGrossCommission,
        input.previouslyRecognized,
      );
      break;
    default:
      grossCommission = roundMoney(input.manualAmount ?? 0);
      break;
  }

  const base: CommissionEventCalculation = {
    tier,
    standardRate,
    drawReductionApplied,
    effectiveRate,
    jobGrossCommission,
    grossCommission,
    depositPayoutPercent,
    previouslyRecognized: roundMoney(input.previouslyRecognized),
    rolloverOffset: 0,
    drawOffset: 0,
    netPayable: 0,
    rolloverObligation: 0,
    remainingRollover: Math.max(0, roundMoney(input.outstandingRollover)),
    remainingDraw: Math.max(0, roundMoney(input.outstandingDraw)),
    warnings,
  };

  if (grossCommission < 0) {
    // Overpaid: no negative payment is ever produced. The amount becomes a
    // rollover obligation that future commission absorbs first.
    base.rolloverObligation = roundMoney(-grossCommission);
    base.remainingRollover = roundMoney(
      base.remainingRollover + base.rolloverObligation,
    );
    warnings.push(
      "This event is negative, so it creates a rollover balance instead of a negative payment.",
    );

    return base;
  }

  const applied = calculateNetCommissionPayable({
    amount: grossCommission,
    outstandingRollover: input.outstandingRollover,
    outstandingDraw: input.outstandingDraw,
  });

  return {
    ...base,
    rolloverOffset: applied.rolloverOffset,
    drawOffset: applied.drawOffset,
    netPayable: applied.payable,
    remainingRollover: applied.remainingRollover,
    remainingDraw: applied.remainingDraw,
  };
}

/**
 * Commission already recognized against a job: everything except voided events.
 * The final true-up is measured against this, so a job can never pay more than
 * the total it earned.
 */
export function previouslyRecognizedCommission(
  events: readonly {
    eventType: CommissionEventType;
    status: string;
    netPayable: number;
  }[],
  options: { excludingEventType?: CommissionEventType } = {},
) {
  return roundMoney(
    events
      .filter((event) => event.status !== "voided")
      .filter((event) => event.eventType !== options.excludingEventType)
      .reduce((total, event) => total + Math.max(0, event.netPayable), 0),
  );
}

/**
 * Idempotency guard used by the services (the database also enforces it with a
 * partial unique index): a job may have at most one deposit and one final
 * true-up event.
 */
export function hasEventOfType(
  events: readonly { eventType: CommissionEventType; status: string }[],
  eventType: CommissionEventType,
) {
  return events.some(
    (event) => event.eventType === eventType && event.status !== "voided",
  );
}

/**
 * Idempotency guard for ledger postings (mirrors the partial unique indexes on
 * `(commission_event_id, transaction_type)`): an event may post at most one offset
 * of each kind, so a retried approval cannot double-apply draw or rollover.
 */
export function hasLedgerEntryForEvent(
  entries: readonly {
    commissionEventId: string | null;
    transactionType: string;
  }[],
  commissionEventId: string,
  transactionType: string,
) {
  return entries.some(
    (entry) =>
      entry.commissionEventId === commissionEventId &&
      entry.transactionType === transactionType,
  );
}
