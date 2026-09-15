import { resolveTierForGpPercent, type TierWindow } from "@/lib/compensation/plan-resolution";
import {
  applyDrawRateReduction,
  calculateDepositCommission,
  calculateGrossCommission,
  type CommissionSettingsSnapshot,
} from "@/lib/commission/engine";
import { computeJobFinancials, roundMoney } from "@/lib/commission/financials";
import type { JobAdjustmentInput, JobFinancialInputs } from "@/lib/commission/types";

/**
 * The live job calculation, in one shape.
 *
 * Everything the Live Calculation panel shows — revenue, cost, profit and the
 * commission estimate — is assembled here from the canonical financial function
 * and the canonical commission engine. The new-job form calls this on every
 * keystroke and the job detail page calls it from stored values; neither owns a
 * formula, and both render the same panel.
 *
 * Projected commission is an estimate. It is what a *deposit* is based on. The
 * authoritative figure for a final true-up is the finalized audit snapshot.
 */

export type LiveCalculation = {
  revenue: {
    originalContractPrice: number;
    changeOrderRevenue: number;
    otherRevenue: number;
    creditAmount: number;
    totalRevenue: number;
  };
  cost: {
    originalCost: number;
    changeOrderCost: number;
    directJobCost: number;
    burdenPercent: number;
    burdenCost: number;
    warrantyContingencyPercent: number;
    warrantyServiceContingency: number;
    totalCost: number;
  };
  profit: {
    grossProfit: number;
    grossProfitPercent: number;
  };
  commission: {
    commissionableRevenue: number;
    commissionableCost: number;
    commissionableGrossProfit: number;
    commissionableGpPercent: number;
    hasTiers: boolean;
    tierLabel: string | null;
    standardRate: number;
    drawReduction: number;
    effectiveRate: number;
    projectedGrossCommission: number;
    depositTarget: number;
    depositPayoutPercent: number;
    previouslyRecognized: number;
    /** Projected minus what has already been recognized; negative = over-recognized. */
    estimatedRemaining: number;
  };
  warnings: readonly string[];
};

export function buildLiveCalculation({
  inputs,
  adjustments = [],
  tiers,
  minimumGpStandard,
  settings,
  onDraw,
  previouslyRecognized = 0,
}: {
  inputs: JobFinancialInputs;
  adjustments?: readonly JobAdjustmentInput[];
  tiers: readonly TierWindow[];
  minimumGpStandard: number;
  settings: CommissionSettingsSnapshot;
  onDraw: boolean;
  previouslyRecognized?: number;
}): LiveCalculation {
  const financials = computeJobFinancials(inputs, adjustments);
  const warnings: string[] = [];
  const tier =
    tiers.length > 0
      ? resolveTierForGpPercent(
          tiers,
          financials.commissionableGpPercent,
          minimumGpStandard,
        )
      : null;

  if (tiers.length === 0) {
    warnings.push(
      "Attach a compensation plan version with tiers to see the commission for this job.",
    );
  } else if (!tier) {
    warnings.push(
      "No commission tier matches this commissionable GP percentage, so the standard rate is 0%.",
    );
  }

  const standardRate = tier?.rate ?? 0;
  const drawReduction =
    onDraw && settings.drawEnabled ? Math.max(0, settings.drawRateReduction) : 0;
  const effectiveRate = applyDrawRateReduction(standardRate, drawReduction);
  const projectedGrossCommission = calculateGrossCommission(
    financials.commissionableGrossProfit,
    effectiveRate,
  );
  const recognized = roundMoney(Math.max(0, previouslyRecognized));
  const estimatedRemaining = roundMoney(projectedGrossCommission - recognized);

  if (estimatedRemaining < 0) {
    warnings.push(
      "More commission has already been recognized than this projection produces, so a final audit would create a rollover obligation rather than a further payment.",
    );
  }

  return {
    revenue: {
      originalContractPrice: roundMoney(inputs.contractRevenue),
      changeOrderRevenue: roundMoney(inputs.changeOrderRevenue),
      otherRevenue: roundMoney(inputs.otherRevenue),
      creditAmount: roundMoney(inputs.creditAmount),
      totalRevenue: financials.actualTotalRevenue,
    },
    cost: {
      originalCost: financials.originalCost,
      changeOrderCost: financials.changeOrderCost,
      directJobCost: financials.directJobCost,
      burdenPercent: financials.burdenPercent,
      burdenCost: financials.burdenCost,
      warrantyContingencyPercent: financials.warrantyContingencyPercent,
      warrantyServiceContingency: financials.warrantyServiceContingency,
      totalCost: financials.actualTotalCost,
    },
    profit: {
      grossProfit: financials.jobGrossProfit,
      grossProfitPercent: financials.jobGpPercent,
    },
    commission: {
      commissionableRevenue: financials.commissionableRevenue,
      commissionableCost: financials.commissionableCost,
      commissionableGrossProfit: financials.commissionableGrossProfit,
      commissionableGpPercent: financials.commissionableGpPercent,
      hasTiers: tiers.length > 0,
      tierLabel: tier?.label ?? null,
      standardRate,
      drawReduction,
      effectiveRate,
      projectedGrossCommission,
      depositTarget: calculateDepositCommission(
        projectedGrossCommission,
        settings.depositPayoutPercent,
      ),
      depositPayoutPercent: settings.depositPayoutPercent,
      previouslyRecognized: recognized,
      estimatedRemaining,
    },
    warnings,
  };
}
