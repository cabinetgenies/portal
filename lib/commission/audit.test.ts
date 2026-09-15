import assert from "node:assert/strict";
import test from "node:test";

import type { TierWindow } from "@/lib/compensation/plan-resolution";
import type { CommissionSettingsSnapshot } from "@/lib/commission/engine";
import {
  auditReadiness,
  buildFinalAuditSnapshot,
  deriveFinalAuditState,
  FINAL_AUDIT_STATE_LABELS,
  finalTrueUpOutcome,
  latestAudit,
  nextAuditRevision,
} from "@/lib/commission/audit";
import { buildJobEntryLiveCalculation } from "@/lib/commission/job-entry";

/**
 * Phase 3.9: the final audit is a snapshot with its own state machine.
 *
 * The tests here cover the two things the UI depends on: the numbers the audit
 * freezes, and what the job's audit state is at each stage of the workflow.
 */

const PRODUCTION_TIERS: TierWindow[] = [
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

const SETTINGS: CommissionSettingsSnapshot = {
  depositPayoutPercent: 0.5,
  drawRateReduction: 0.05,
  drawEnabled: true,
};

function calculationFor({
  contract = "100000",
  originalCost = "50000",
  changeOrders = [],
  onDraw = false,
  previouslyRecognized = 0,
}: {
  contract?: string;
  originalCost?: string;
  changeOrders?: { revenue: number; cost: number }[];
  onDraw?: boolean;
  previouslyRecognized?: number;
}) {
  return buildJobEntryLiveCalculation({
    values: { contractRevenue: contract, originalCost },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders,
    tiers: PRODUCTION_TIERS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw,
    previouslyRecognized,
  });
}

test("the snapshot freezes the audited inputs, rate and true-up", () => {
  const snapshot = buildFinalAuditSnapshot({
    calculation: calculationFor({
      changeOrders: [{ revenue: 10000, cost: 4000 }],
      previouslyRecognized: 7500,
    }),
  });

  // 110,000 revenue over 54,000 direct cost → 50.9% GP → 30% → 16,200 gross.
  assert.equal(snapshot.originalContractPrice, 100000);
  assert.equal(snapshot.changeOrderRevenue, 10000);
  assert.equal(snapshot.finalTotalRevenue, 110000);
  assert.equal(snapshot.originalCost, 50000);
  assert.equal(snapshot.changeOrderCost, 4000);
  assert.equal(snapshot.directJobCost, 54000);
  assert.equal(snapshot.finalTotalCost, 54000);
  assert.equal(snapshot.finalGrossProfit, 56000);
  assert.equal(snapshot.tierLabel, "50% GP and above");
  assert.equal(snapshot.standardCommissionRate, 0.3);
  assert.equal(snapshot.effectiveCommissionRate, 0.3);
  assert.equal(snapshot.finalGrossCommission, 16800);
  assert.equal(snapshot.previouslyRecognized, 7500);
  assert.equal(snapshot.finalTrueUp, 9300);
});

test("the snapshot records the draw reduction that applied at finalization", () => {
  const snapshot = buildFinalAuditSnapshot({
    calculation: calculationFor({ onDraw: true }),
  });

  assert.equal(snapshot.standardCommissionRate, 0.3);
  assert.equal(snapshot.drawRateReduction, 0.05);
  assert.equal(snapshot.effectiveCommissionRate, 0.25);
  assert.equal(snapshot.finalGrossCommission, 12500);
  assert.equal(snapshot.finalTrueUp, 12500);
});

test("a later change to the job's financials does not change a snapshot", () => {
  const beforeEdit = buildFinalAuditSnapshot({
    calculation: calculationFor({ changeOrders: [{ revenue: 10000, cost: 4000 }] }),
  });

  // The job is edited afterwards; the audit was already finalized.
  const afterEdit = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "70000" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: PRODUCTION_TIERS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  assert.equal(beforeEdit.finalTrueUp, 16800);
  assert.notEqual(afterEdit.commission.projectedGrossCommission, beforeEdit.finalGrossCommission);
  // The snapshot is a plain value object: nothing about it reads the job again.
  assert.equal(beforeEdit.finalTotalCost, 54000);
  assert.equal(beforeEdit.finalGrossCommission, 16800);
});

test("the true-up outcome reads as payable, settled or a rollover", () => {
  assert.equal(finalTrueUpOutcome(500), "payable");
  assert.equal(finalTrueUpOutcome(0), "settled");
  assert.equal(finalTrueUpOutcome(-500), "rollover");
});

test("the audit state follows the workflow: open, finalize, true-up, settle", () => {
  const notStarted = deriveFinalAuditState({ audits: [], finalEventStatus: null });
  assert.equal(notStarted, "not_started");
  assert.equal(FINAL_AUDIT_STATE_LABELS[notStarted], "Not started");

  const inReview = deriveFinalAuditState({
    audits: [{ status: "in_review", revision: 1 }],
    finalEventStatus: null,
  });
  assert.equal(inReview, "in_review");

  const finalized = deriveFinalAuditState({
    audits: [{ status: "finalized", revision: 1 }],
    finalEventStatus: null,
  });
  assert.equal(finalized, "finalized");

  const trueUpCreated = deriveFinalAuditState({
    audits: [{ status: "finalized", revision: 1 }],
    finalEventStatus: "approved",
  });
  assert.equal(trueUpCreated, "true_up_created");

  const settled = deriveFinalAuditState({
    audits: [{ status: "finalized", revision: 1 }],
    finalEventStatus: "paid",
  });
  assert.equal(settled, "settled");

  // A voided true-up falls back to the audit still standing.
  const afterVoid = deriveFinalAuditState({
    audits: [{ status: "finalized", revision: 1 }],
    finalEventStatus: "voided",
  });
  assert.equal(afterVoid, "finalized");
});

test("a superseded revision does not make a job look audited", () => {
  const state = deriveFinalAuditState({
    audits: [{ status: "superseded", revision: 1 }],
    finalEventStatus: null,
  });

  assert.equal(state, "not_started");
});

test("revisions are appended, never renumbered", () => {
  assert.equal(nextAuditRevision([]), 1);
  assert.equal(nextAuditRevision([{ revision: 1 }]), 2);
  assert.equal(nextAuditRevision([{ revision: 3 }, { revision: 1 }]), 4);
  assert.equal(
    latestAudit([
      { revision: 1, status: "superseded" },
      { revision: 3, status: "in_review" },
      { revision: 2, status: "superseded" },
    ])?.revision,
    3,
  );
  assert.equal(latestAudit([]), null);
});

test("readiness names exactly what is missing before finalizing", () => {
  const complete = auditReadiness({
    calculation: calculationFor({}),
    hasPlanVersion: true,
  });
  assert.deepEqual([...complete], []);

  const noPlan = auditReadiness({
    calculation: calculationFor({}),
    hasPlanVersion: false,
  });
  assert.equal(noPlan.length, 1);
  assert.match(String(noPlan[0]), /plan version/i);

  const noTiers = auditReadiness({
    calculation: buildJobEntryLiveCalculation({
      values: { contractRevenue: "100000", originalCost: "50000" },
      rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
      changeOrders: [],
      tiers: [],
      minimumGpStandard: 0,
      settings: SETTINGS,
      onDraw: false,
    }),
    hasPlanVersion: true,
  });
  assert.match(String(noTiers[0]), /no tiers/i);

  const noCost = auditReadiness({
    calculation: calculationFor({ originalCost: "0" }),
    hasPlanVersion: true,
  });
  assert.match(String(noCost[0]), /no recorded cost/i);
});

test("a job under 35% GP is auditable on the plan's 0% band, not blocked", () => {
  // 100,000 revenue over 80,000 cost → 20% GP. The production plan defines a
  // catch-all band at 0%, so the audit is allowed to finalize at zero commission.
  const calculation = calculationFor({ originalCost: "80000" });
  const blockers = auditReadiness({ calculation, hasPlanVersion: true });
  const snapshot = buildFinalAuditSnapshot({ calculation });

  assert.deepEqual([...blockers], []);
  assert.equal(snapshot.tierLabel, "Under 35% GP");
  assert.equal(snapshot.standardCommissionRate, 0);
  assert.equal(snapshot.finalGrossCommission, 0);
  assert.equal(snapshot.finalTrueUp, 0);
  assert.equal(finalTrueUpOutcome(snapshot.finalTrueUp), "settled");
});

test("a negative-GP job is fully auditable on the open-ended bottom band", () => {
  // The v2 schedule's bottom band is open-ended, so a loss-making job resolves to
  // "Below 30%" at 0% and the audit proceeds like any other.
  const v2Bands: TierWindow[] = [
    {
      sortOrder: 1,
      label: "49% GP and above",
      rate: 0.3,
      lower: { thresholdType: "fixed", value: 0.49 },
      upper: { thresholdType: "fixed", value: null },
    },
    {
      sortOrder: 7,
      label: "Below 30% GP (no commission)",
      rate: 0,
      lower: { thresholdType: "fixed", value: null },
      upper: { thresholdType: "fixed", value: 0.3 },
    },
  ];

  // 100,000 revenue over 120,000 cost → -20% GP.
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "120000" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: v2Bands,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  assert.equal(calculation.profit.grossProfitPercent, -0.2);
  assert.equal(calculation.commission.tierLabel, "Below 30% GP (no commission)");
  assert.equal(calculation.commission.standardRate, 0);
  assert.equal(calculation.commission.projectedGrossCommission, 0);

  // Readiness must not treat a loss-making job as a configuration error.
  assert.deepEqual([...auditReadiness({ calculation, hasPlanVersion: true })], []);

  const snapshot = buildFinalAuditSnapshot({ calculation });

  assert.equal(snapshot.finalGpPercent, -0.2);
  assert.equal(snapshot.tierLabel, "Below 30% GP (no commission)");
  assert.equal(snapshot.standardCommissionRate, 0);
  assert.equal(snapshot.effectiveCommissionRate, 0);
  assert.equal(snapshot.finalGrossCommission, 0);
  assert.equal(snapshot.finalTrueUp, 0);
  assert.equal(finalTrueUpOutcome(snapshot.finalTrueUp), "settled");
});

test("a gap in the tier bands blocks finalization", () => {
  // A plan version whose bands stop at 50%: a 40% GP job then matches nothing, and
  // the audit says so instead of finalizing at a rate nobody chose.
  const gappedTiers: TierWindow[] = [PRODUCTION_TIERS[0]];
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "60000" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: gappedTiers,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  const blockers = auditReadiness({ calculation, hasPlanVersion: true });

  assert.equal(blockers.length, 1);
  assert.match(String(blockers[0]), /no commission tier matches/i);
});
