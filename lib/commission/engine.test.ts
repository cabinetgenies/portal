import assert from "node:assert/strict";
import test from "node:test";

import type { TierWindow } from "@/lib/compensation/plan-resolution";
import {
  applyDrawBalance,
  applyDrawRateReduction,
  applyRolloverBalance,
  calculateCommissionEvent,
  calculateDepositCommission,
  calculateFinalTrueUp,
  calculateGrossCommission,
  calculateNetCommissionPayable,
  calculateOutstandingDrawBalance,
  calculateOutstandingRolloverBalance,
  calculateStandardCommissionRate,
  hasEventOfType,
  hasLedgerEntryForEvent,
  previouslyRecognizedCommission,
  resolveCommissionTier,
  type CommissionEventCalculationInput,
} from "@/lib/commission/engine";
import { computeJobFinancials, roundMoney } from "@/lib/commission/financials";
import {
  EMPTY_JOB_FINANCIAL_INPUTS,
  type CommissionEventType,
  type DrawTransactionType,
  type RolloverTransactionType,
} from "@/lib/commission/types";

/** The seeded Cabinet Genies production schedule (configuration, not constants). */
const productionTiers: TierWindow[] = [
  {
    sortOrder: 1,
    label: "50% GP and above",
    rate: 0.3,
    lower: { thresholdType: "fixed", value: 0.5 },
    upper: { thresholdType: "fixed", value: null },
  },
  {
    sortOrder: 2,
    label: "45% to under 50% GP",
    rate: 0.2,
    lower: { thresholdType: "fixed", value: 0.45 },
    upper: { thresholdType: "fixed", value: 0.5 },
  },
  {
    sortOrder: 3,
    label: "35% to under 45% GP",
    rate: 0.1,
    lower: { thresholdType: "fixed", value: 0.35 },
    upper: { thresholdType: "fixed", value: 0.45 },
  },
  {
    sortOrder: 4,
    label: "Under 35% GP",
    rate: 0,
    lower: { thresholdType: "fixed", value: null },
    upper: { thresholdType: "fixed", value: 0.35 },
  },
];

const settings = {
  depositPayoutPercent: 0.5,
  drawRateReduction: 0.05,
  drawEnabled: true,
};

const eventInput = (
  overrides: Partial<CommissionEventCalculationInput> = {},
): CommissionEventCalculationInput => ({
  jobId: "job-1",
  profileId: "designer-1",
  eventType: "deposit",
  stage: "projected",
  commissionableGp: 40_000,
  commissionableGpPercent: 0.5,
  tiers: productionTiers,
  minimumGpStandard: 0.36,
  plan: { planId: "plan-1", planVersionId: "version-1", versionName: "v1" },
  settings,
  onDraw: false,
  outstandingRollover: 0,
  outstandingDraw: 0,
  previouslyRecognized: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tier boundaries
// ---------------------------------------------------------------------------

test("tier boundaries resolve to the configured rate", () => {
  assert.equal(calculateStandardCommissionRate(0.5, productionTiers, 0.36), 0.3);
  assert.equal(calculateStandardCommissionRate(0.4999, productionTiers, 0.36), 0.2);
  assert.equal(calculateStandardCommissionRate(0.45, productionTiers, 0.36), 0.2);
  assert.equal(calculateStandardCommissionRate(0.4499, productionTiers, 0.36), 0.1);
  assert.equal(calculateStandardCommissionRate(0.35, productionTiers, 0.36), 0.1);
  assert.equal(calculateStandardCommissionRate(0.3499, productionTiers, 0.36), 0);
});

test("a gross-profit percentage far above the top tier still uses the top rate", () => {
  assert.equal(calculateStandardCommissionRate(0.87, productionTiers, 0.36), 0.3);
});

test("resolveCommissionTier reports the band it used", () => {
  assert.deepEqual(resolveCommissionTier(0.46, productionTiers, 0.36), {
    rate: 0.2,
    label: "45% to under 50% GP",
    sortOrder: 2,
  });
});

test("no configured tier matching means a 0% standard rate, not a silent default", () => {
  assert.equal(calculateStandardCommissionRate(0.5, [], 0.36), 0);
});

test("gross commission is commissionable GP multiplied by the effective rate", () => {
  assert.equal(calculateGrossCommission(40_000, 0.3), 12_000);
  assert.equal(calculateGrossCommission(33_333.33, 0.1), 3_333.33);
});

// ---------------------------------------------------------------------------
// Draw against commission
// ---------------------------------------------------------------------------

test("draw reduces the rate by percentage points, never by multiplication", () => {
  assert.equal(applyDrawRateReduction(0.3, 0.05), 0.25);
  assert.equal(applyDrawRateReduction(0.2, 0.05), 0.15);
  assert.equal(applyDrawRateReduction(0.1, 0.05), 0.05);
  assert.equal(applyDrawRateReduction(0, 0.05), 0);
});

test("the draw reduction is configurable and never pushes a rate below zero", () => {
  assert.equal(applyDrawRateReduction(0.3, 0.1), 0.2);
  assert.equal(applyDrawRateReduction(0.02, 0.05), 0);
  assert.equal(applyDrawRateReduction(0.3, 0), 0.3);
});

test("an employee on draw has the reduction snapshotted onto the event", () => {
  const calculation = calculateCommissionEvent(eventInput({ onDraw: true }));

  assert.equal(calculation.standardRate, 0.3);
  assert.equal(calculation.drawReductionApplied, 0.05);
  assert.equal(calculation.effectiveRate, 0.25);
  assert.equal(calculation.jobGrossCommission, 10_000);
});

test("draw has no effect when the draw system is disabled globally", () => {
  const calculation = calculateCommissionEvent(
    eventInput({ onDraw: true, settings: { ...settings, drawEnabled: false } }),
  );

  assert.equal(calculation.drawReductionApplied, 0);
  assert.equal(calculation.effectiveRate, 0.3);
});

// ---------------------------------------------------------------------------
// Deposit payout
// ---------------------------------------------------------------------------

test("the deposit payout is 50% of projected gross commission by default", () => {
  const calculation = calculateCommissionEvent(eventInput());

  assert.equal(calculation.jobGrossCommission, 12_000);
  assert.equal(calculation.grossCommission, 6_000);
  assert.equal(calculation.depositPayoutPercent, 0.5);
});

test("the deposit percentage is configuration", () => {
  assert.equal(calculateDepositCommission(12_000, 0.25), 3_000);
  assert.equal(
    calculateCommissionEvent(
      eventInput({ settings: { ...settings, depositPayoutPercent: 0.25 } }),
    ).grossCommission,
    3_000,
  );
});

test("a deposit event for a designer on draw uses the reduced rate", () => {
  const calculation = calculateCommissionEvent(eventInput({ onDraw: true }));

  assert.equal(calculation.jobGrossCommission, 10_000);
  assert.equal(calculation.grossCommission, 5_000);
});

// ---------------------------------------------------------------------------
// Final audit and true-up
// ---------------------------------------------------------------------------

test("a positive final true-up pays the difference between final and recognized", () => {
  assert.equal(calculateFinalTrueUp(11_000, 5_000), 6_000);

  const calculation = calculateCommissionEvent(
    eventInput({
      eventType: "final_true_up",
      stage: "final",
      commissionableGp: 36_666.67,
      commissionableGpPercent: 0.5,
      previouslyRecognized: 5_000,
    }),
  );

  assert.equal(calculation.jobGrossCommission, 11_000);
  assert.equal(calculation.grossCommission, 6_000);
  assert.equal(calculation.netPayable, 6_000);
});

test("a zero final true-up produces no payment and no rollover", () => {
  const calculation = calculateCommissionEvent(
    eventInput({
      eventType: "final_true_up",
      stage: "final",
      commissionableGp: 16_666.67,
      previouslyRecognized: 5_000,
    }),
  );

  assert.equal(calculation.grossCommission, 0);
  assert.equal(calculation.netPayable, 0);
  assert.equal(calculation.rolloverObligation, 0);
});

test("a negative final true-up creates a rollover obligation, never a negative payment", () => {
  const calculation = calculateCommissionEvent(
    eventInput({
      eventType: "final_true_up",
      stage: "final",
      commissionableGp: 13_333.33,
      previouslyRecognized: 5_000,
    }),
  );

  assert.equal(calculation.grossCommission, -1_000);
  assert.equal(calculation.netPayable, 0);
  assert.equal(calculation.rolloverObligation, 1_000);
  assert.equal(calculation.remainingRollover, 1_000);
  assert.equal(calculation.remainingDraw, 0);
});

// ---------------------------------------------------------------------------
// Rollover absorption
// ---------------------------------------------------------------------------

test("a rollover is fully absorbed by the next commission", () => {
  const application = applyRolloverBalance(3_500, 1_000);

  assert.deepEqual(application, { offset: 1_000, remaining: 2_500, newBalance: 0 });
});

test("a rollover is partially absorbed when commission is smaller", () => {
  const application = applyRolloverBalance(2_500, 4_000);

  assert.deepEqual(application, { offset: 2_500, remaining: 0, newBalance: 1_500 });
});

test("a rollover survives across multiple commission events until it clears", () => {
  const entries: { transactionType: RolloverTransactionType; amount: number }[] = [
    { transactionType: "negative_true_up", amount: 4_000 },
  ];

  // First event absorbs 2,500 of it.
  const first = calculateNetCommissionPayable({
    amount: 2_500,
    outstandingRollover: calculateOutstandingRolloverBalance(entries),
  });
  entries.push({ transactionType: "future_commission_offset", amount: -first.rolloverOffset });
  assert.equal(first.payable, 0);
  assert.equal(calculateOutstandingRolloverBalance(entries), 1_500);

  // Second event clears the remainder and pays the rest in cash.
  const second = calculateNetCommissionPayable({
    amount: 2_000,
    outstandingRollover: calculateOutstandingRolloverBalance(entries),
  });
  entries.push({ transactionType: "future_commission_offset", amount: -second.rolloverOffset });
  assert.equal(second.rolloverOffset, 1_500);
  assert.equal(second.payable, 500);
  assert.equal(calculateOutstandingRolloverBalance(entries), 0);
});

// ---------------------------------------------------------------------------
// Draw absorption
// ---------------------------------------------------------------------------

test("a draw balance is fully absorbed by the next commission", () => {
  const application = applyDrawBalance(3_000, 2_000);

  assert.deepEqual(application, { offset: 2_000, remaining: 1_000, newBalance: 0 });
});

test("a draw balance is partially absorbed when commission is smaller", () => {
  const application = applyDrawBalance(3_000, 5_000);

  assert.deepEqual(application, { offset: 3_000, remaining: 0, newBalance: 2_000 });
});

test("a draw balance survives across multiple commission events until it clears", () => {
  const entries: { transactionType: DrawTransactionType; amount: number }[] = [
    { transactionType: "draw_advance", amount: 5_000 },
  ];

  const first = calculateNetCommissionPayable({
    amount: 3_000,
    outstandingDraw: calculateOutstandingDrawBalance(entries),
  });
  entries.push({ transactionType: "commission_offset", amount: -first.drawOffset });
  assert.equal(first.drawOffset, 3_000);
  assert.equal(first.payable, 0);
  assert.equal(calculateOutstandingDrawBalance(entries), 2_000);

  const second = calculateNetCommissionPayable({
    amount: 3_000,
    outstandingDraw: calculateOutstandingDrawBalance(entries),
  });
  entries.push({ transactionType: "commission_offset", amount: -second.drawOffset });
  assert.equal(second.drawOffset, 2_000);
  assert.equal(second.payable, 1_000);
  assert.equal(calculateOutstandingDrawBalance(entries), 0);
});

// ---------------------------------------------------------------------------
// Combined offsets and ordering
// ---------------------------------------------------------------------------

test("rollover is applied before draw, and the remainder becomes cash payable", () => {
  const application = calculateNetCommissionPayable({
    amount: 5_000,
    outstandingRollover: 1_000,
    outstandingDraw: 3_000,
  });

  assert.equal(application.rolloverOffset, 1_000);
  assert.equal(application.drawOffset, 3_000);
  assert.equal(application.payable, 1_000);
  assert.equal(application.remainingRollover, 0);
  assert.equal(application.remainingDraw, 0);
});

test("when rollover exceeds the earned commission the draw is untouched", () => {
  const application = calculateNetCommissionPayable({
    amount: 900,
    outstandingRollover: 1_000,
    outstandingDraw: 3_000,
  });

  assert.equal(application.rolloverOffset, 900);
  assert.equal(application.drawOffset, 0);
  assert.equal(application.payable, 0);
  assert.equal(application.remainingRollover, 100);
  assert.equal(application.remainingDraw, 3_000);
});

test("a full commission event applies rollover, then draw, then cash", () => {
  const calculation = calculateCommissionEvent(
    eventInput({
      eventType: "final_true_up",
      stage: "final",
      commissionableGp: 16_666.67,
      previouslyRecognized: 0,
      outstandingRollover: 1_000,
      outstandingDraw: 1_500,
    }),
  );

  assert.equal(calculation.grossCommission, 5_000);
  assert.equal(calculation.rolloverOffset, 1_000);
  assert.equal(calculation.drawOffset, 1_500);
  assert.equal(calculation.netPayable, 2_500);
});

// ---------------------------------------------------------------------------
// Financial behavior: burden, change orders, commissionable GP
// ---------------------------------------------------------------------------

test("change-order revenue increases commissionable revenue and therefore commission", () => {
  const base = computeJobFinancials({
    ...EMPTY_JOB_FINANCIAL_INPUTS,
    contractRevenue: 100_000,
    materialCost: 30_000,
    laborCost: 20_000,
  });
  const withChangeOrder = computeJobFinancials({
    ...EMPTY_JOB_FINANCIAL_INPUTS,
    contractRevenue: 100_000,
    changeOrderRevenue: 10_000,
    materialCost: 30_000,
    laborCost: 20_000,
  });

  assert.equal(base.commissionableGrossProfit, 50_000);
  assert.equal(withChangeOrder.commissionableGrossProfit, 60_000);

  const withoutChangeOrder = calculateGrossCommission(
    base.commissionableGrossProfit,
    calculateStandardCommissionRate(base.commissionableGpPercent, productionTiers, 0.36),
  );
  const withChangeOrderCommission = calculateGrossCommission(
    withChangeOrder.commissionableGrossProfit,
    calculateStandardCommissionRate(
      withChangeOrder.commissionableGpPercent,
      productionTiers,
      0.36,
    ),
  );

  assert.ok(withChangeOrderCommission > withoutChangeOrder);
});

test("burden lowers GP before tier selection, so it can change the tier", () => {
  const withoutBurden = computeJobFinancials({
    ...EMPTY_JOB_FINANCIAL_INPUTS,
    contractRevenue: 100_000,
    materialCost: 45_000,
    laborCost: 5_000,
  });
  const withBurden = computeJobFinancials({
    ...EMPTY_JOB_FINANCIAL_INPUTS,
    contractRevenue: 100_000,
    materialCost: 45_000,
    laborCost: 5_000,
    burdenCost: 6_000,
  });

  // 50% GP is the top tier; adding burden drops the job into the 20% band.
  assert.equal(withoutBurden.commissionableGpPercent, 0.5);
  assert.equal(
    calculateStandardCommissionRate(
      withoutBurden.commissionableGpPercent,
      productionTiers,
      0.36,
    ),
    0.3,
  );
  assert.equal(withBurden.commissionableGpPercent, 0.44);
  assert.equal(
    calculateStandardCommissionRate(
      withBurden.commissionableGpPercent,
      productionTiers,
      0.36,
    ),
    0.1,
  );
});

// ---------------------------------------------------------------------------
// Historical protection
// ---------------------------------------------------------------------------

test("changing the plan version later does not alter an existing event", () => {
  const stored = calculateCommissionEvent(eventInput());
  const revisedTiers: TierWindow[] = productionTiers.map((tier) =>
    tier.rate === 0.3 ? { ...tier, rate: 0.4 } : tier,
  );

  const recalculatedAfterRateChange = calculateCommissionEvent(
    eventInput({ tiers: revisedTiers }),
  );

  // The stored event keeps its snapshot; only a new calculation sees the new rule.
  assert.equal(stored.standardRate, 0.3);
  assert.equal(stored.grossCommission, 6_000);
  assert.equal(recalculatedAfterRateChange.standardRate, 0.4);
  assert.equal(recalculatedAfterRateChange.grossCommission, 8_000);
});

test("previously recognized commission sums stored events and ignores voided ones", () => {
  const events: {
    eventType: CommissionEventType;
    status: string;
    netPayable: number;
  }[] = [
    { eventType: "deposit", status: "paid", netPayable: 5_000 },
    { eventType: "manual_adjustment", status: "approved", netPayable: 500 },
    { eventType: "manual_adjustment", status: "voided", netPayable: 9_999 },
    { eventType: "final_true_up", status: "calculated", netPayable: 0 },
  ];

  assert.equal(previouslyRecognizedCommission(events), 5_500);
  assert.equal(
    previouslyRecognizedCommission(events, { excludingEventType: "final_true_up" }),
    5_500,
  );
});

// ---------------------------------------------------------------------------
// Idempotency guards
// ---------------------------------------------------------------------------

test("a duplicate deposit event is rejected by the idempotency guard", () => {
  const events: { eventType: CommissionEventType; status: string }[] = [
    { eventType: "deposit", status: "pending_approval" },
  ];

  assert.equal(hasEventOfType(events, "deposit"), true);
  assert.equal(hasEventOfType(events, "final_true_up"), false);
});

test("a duplicate final true-up is rejected by the idempotency guard", () => {
  const events: { eventType: CommissionEventType; status: string }[] = [
    { eventType: "deposit", status: "paid" },
    { eventType: "final_true_up", status: "approved" },
  ];

  assert.equal(hasEventOfType(events, "final_true_up"), true);
});

test("a voided event does not block recreating it", () => {
  const events: { eventType: CommissionEventType; status: string }[] = [
    { eventType: "deposit", status: "voided" },
  ];

  assert.equal(hasEventOfType(events, "deposit"), false);
});

test("a duplicate rollover offset for the same event is rejected by the guard", () => {
  const entries: { commissionEventId: string | null; transactionType: string }[] = [
    { commissionEventId: "event-1", transactionType: "future_commission_offset" },
  ];

  assert.equal(
    hasLedgerEntryForEvent(entries, "event-1", "future_commission_offset"),
    true,
  );
  assert.equal(
    hasLedgerEntryForEvent(entries, "event-2", "future_commission_offset"),
    false,
  );
});

test("a duplicate draw offset for the same event is rejected by the guard", () => {
  const entries: { commissionEventId: string | null; transactionType: string }[] = [
    { commissionEventId: "event-1", transactionType: "commission_offset" },
  ];

  assert.equal(hasLedgerEntryForEvent(entries, "event-1", "commission_offset"), true);
  assert.equal(hasLedgerEntryForEvent(entries, "event-1", "manual_adjustment"), false);
});

// ---------------------------------------------------------------------------
// Ledger balance derivation
// ---------------------------------------------------------------------------

test("outstanding draw is derived from signed ledger entries", () => {
  assert.equal(
    calculateOutstandingDrawBalance([
      { transactionType: "draw_advance", amount: 5_000 },
      { transactionType: "commission_offset", amount: -3_000 },
    ]),
    2_000,
  );

  assert.equal(
    calculateOutstandingDrawBalance([
      { transactionType: "draw_advance", amount: 5_000 },
      { transactionType: "repayment", amount: -5_000 },
    ]),
    0,
  );
});

test("outstanding rollover is derived from signed ledger entries", () => {
  assert.equal(
    calculateOutstandingRolloverBalance([
      { transactionType: "negative_true_up", amount: 1_000 },
      { transactionType: "future_commission_offset", amount: -400 },
    ]),
    600,
  );

  assert.equal(calculateOutstandingRolloverBalance([]), 0);
});

test("balances never report a negative outstanding amount", () => {
  assert.equal(
    calculateOutstandingDrawBalance([
      { transactionType: "draw_advance", amount: 1_000 },
      { transactionType: "manual_adjustment", amount: -1_200 },
    ]),
    0,
  );
  assert.equal(
    roundMoney(calculateOutstandingRolloverBalance([])),
    0,
  );
});
