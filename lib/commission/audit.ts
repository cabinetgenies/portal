import { roundMoney } from "@/lib/commission/financials";
import type { LiveCalculation } from "@/lib/commission/live-calculation";

// The final commission audit.
//
// The audit is where the live estimate stops and the authoritative figure starts.
// Everything it stores is a snapshot: the inputs as they were at finalization, the
// plan version, the tier and rates, the burden and warranty percentages and dollars,
// and the resulting true-up. Nothing here recalculates from the job afterwards, so a
// later change to the job's financials cannot rewrite what was audited.

export const COMMISSION_AUDIT_STATUSES = ["in_review", "finalized", "superseded"] as const;
export type CommissionAuditStatus = (typeof COMMISSION_AUDIT_STATUSES)[number];

export type FinalAuditState =
  | "not_started"
  | "in_review"
  | "finalized"
  | "true_up_created"
  | "settled";

export const FINAL_AUDIT_STATE_LABELS: Record<FinalAuditState, string> = {
  not_started: "Not started",
  in_review: "In review",
  finalized: "Finalized",
  true_up_created: "True-up created",
  settled: "Settled",
};

export type FinalAuditSnapshot = {
  originalContractPrice: number;
  changeOrderRevenue: number;
  otherRevenue: number;
  creditAmount: number;
  originalCost: number;
  changeOrderCost: number;
  directJobCost: number;
  burdenPercent: number;
  burdenCost: number;
  warrantyContingencyPercent: number;
  warrantyServiceContingency: number;
  finalTotalRevenue: number;
  finalTotalCost: number;
  finalGrossProfit: number;
  finalGpPercent: number;
  commissionableRevenue: number;
  commissionableCost: number;
  commissionableGrossProfit: number;
  commissionableGpPercent: number;
  tierLabel: string | null;
  standardCommissionRate: number;
  drawRateReduction: number;
  effectiveCommissionRate: number;
  finalGrossCommission: number;
  previouslyRecognized: number;
  finalTrueUp: number;
};

// Flattens a live calculation into the audit snapshot.
//
// The caller passes the live calculation rather than raw inputs, so the audited
// figures and the figures on screen are produced by the same canonical functions.
export function buildFinalAuditSnapshot({
  calculation,
  previouslyRecognized = calculation.commission.previouslyRecognized,
}: {
  calculation: LiveCalculation;
  previouslyRecognized?: number;
}): FinalAuditSnapshot {
  const recognized = roundMoney(Math.max(0, previouslyRecognized));
  const finalGrossCommission = calculation.commission.projectedGrossCommission;

  return {
    originalContractPrice: calculation.revenue.originalContractPrice,
    changeOrderRevenue: calculation.revenue.changeOrderRevenue,
    otherRevenue: calculation.revenue.otherRevenue,
    creditAmount: calculation.revenue.creditAmount,
    originalCost: calculation.cost.originalCost,
    changeOrderCost: calculation.cost.changeOrderCost,
    directJobCost: calculation.cost.directJobCost,
    burdenPercent: calculation.cost.burdenPercent,
    burdenCost: calculation.cost.burdenCost,
    warrantyContingencyPercent: calculation.cost.warrantyContingencyPercent,
    warrantyServiceContingency: calculation.cost.warrantyServiceContingency,
    finalTotalRevenue: calculation.revenue.totalRevenue,
    finalTotalCost: calculation.cost.totalCost,
    finalGrossProfit: calculation.profit.grossProfit,
    finalGpPercent: calculation.profit.grossProfitPercent,
    commissionableRevenue: calculation.commission.commissionableRevenue,
    commissionableCost: calculation.commission.commissionableCost,
    commissionableGrossProfit: calculation.commission.commissionableGrossProfit,
    commissionableGpPercent: calculation.commission.commissionableGpPercent,
    tierLabel: calculation.commission.tierLabel,
    standardCommissionRate: calculation.commission.standardRate,
    drawRateReduction: calculation.commission.drawReduction,
    effectiveCommissionRate: calculation.commission.effectiveRate,
    finalGrossCommission,
    previouslyRecognized: recognized,
    finalTrueUp: roundMoney(finalGrossCommission - recognized),
  };
}

export type FinalTrueUpOutcome = "payable" | "settled" | "rollover";

export function finalTrueUpOutcome(finalTrueUp: number): FinalTrueUpOutcome {
  if (finalTrueUp > 0) return "payable";
  if (finalTrueUp < 0) return "rollover";

  return "settled";
}

export const FINAL_TRUE_UP_OUTCOME_LABELS: Record<FinalTrueUpOutcome, string> = {
  payable: "Amount still payable",
  settled: "Commission settled",
  rollover: "Rollover obligation created",
};

// The job's audit state: a created true-up outranks a finalized audit, and a paid
// true-up means everything is settled. A voided true-up falls back to "finalized":
// the audit still stands, and a replacement true-up can be created.
export function deriveFinalAuditState({
  audits,
  finalEventStatus,
}: {
  audits: readonly { status: string; revision: number }[];
  finalEventStatus: string | null;
}): FinalAuditState {
  if (finalEventStatus === "paid") return "settled";
  if (finalEventStatus && finalEventStatus !== "voided") return "true_up_created";
  if (audits.some((audit) => audit.status === "in_review")) return "in_review";
  if (audits.some((audit) => audit.status === "finalized")) return "finalized";

  return "not_started";
}

export function latestAudit<T extends { revision: number; status: string }>(
  audits: readonly T[],
): T | null {
  if (audits.length === 0) return null;

  return [...audits].sort((a, b) => b.revision - a.revision)[0];
}

// The next revision number: audits are append-only, never renumbered.
export function nextAuditRevision(audits: readonly { revision: number }[]): number {
  return audits.reduce((highest, audit) => Math.max(highest, audit.revision), 0) + 1;
}

// What still has to be true before an audit can be finalized. Returned as a list so
// the review screen can say exactly what is missing rather than failing on submit.
export function auditReadiness({
  calculation,
  hasPlanVersion,
}: {
  calculation: LiveCalculation;
  hasPlanVersion: boolean;
}): readonly string[] {
  const blockers: string[] = [];

  if (!hasPlanVersion) {
    blockers.push(
      "Attach the compensation plan version that governs this job — the audit must snapshot the rates it was measured against.",
    );
  } else if (!calculation.commission.hasTiers) {
    blockers.push(
      "The attached plan version has no tiers, so no commission rate can be determined.",
    );
  } else if (!calculation.commission.tierLabel) {
    blockers.push(
      "No commission tier matches this job's commissionable GP percentage. Check the plan's tier bands before finalizing.",
    );
  }

  if (calculation.cost.totalCost <= 0) {
    blockers.push(
      "This job has no recorded cost, so gross profit cannot be audited. Enter the original cost and any change orders first.",
    );
  }

  return blockers;
}
