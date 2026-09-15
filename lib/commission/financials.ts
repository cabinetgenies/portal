import type {
  AdjustmentType,
  JobAdjustmentInput,
  JobFinancialInputs,
  JobFinancialResults,
} from "@/lib/commission/types";

/**
 * The single canonical implementation of Cabinet Genies job financial math.
 *
 * Rules that this module owns:
 *   total job revenue        = contract + change orders + other revenue - credits
 *   total job cost           = material + labor + subcontractor + other direct
 *                              + burden + warranty/service contingency
 *   actual totals            = the above plus revenue/cost adjustments
 *   job gross profit         = actual total revenue - actual total cost
 *   commissionable revenue   = actual total revenue + commissionable revenue adjustments
 *   commissionable cost      = actual total cost + commissionable cost adjustments
 *   commissionable GP        = commissionable revenue - commissionable cost
 *
 * Commissionable gross profit is deliberately a separate calculation from job
 * gross profit: exclusions (warranty/service contingency, non-commissionable
 * product, allowances, ...) are recorded as explicit adjustments rather than
 * being hardcoded here. With no adjustments the two are equal.
 *
 * No commission *dollars* are calculated anywhere in this module — applying a
 * tier rate is Phase 3.
 *
 * Money is accumulated in integer cents so repeated addition cannot drift, and
 * percentages are rounded once at the end.
 */

const CENTS_PER_UNIT = 100;
const PERCENT_DECIMALS = 1_000_000;

function toCents(amount: number) {
  // Defensive: PostgreSQL numeric values can arrive as strings depending on the
  // client, and a string would silently poison every total.
  const numeric = typeof amount === "number" ? amount : Number(amount);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  // Pre-round the scaled value so binary floating point cannot push a half cent
  // the wrong way (1.005 * 100 is 100.49999999999999 in IEEE 754).
  const scaled = Number((numeric * CENTS_PER_UNIT).toFixed(4));

  return Math.round(scaled);
}

function fromCents(cents: number) {
  return cents / CENTS_PER_UNIT;
}

/** Rounds a money amount to whole cents. */
export function roundMoney(amount: number) {
  return fromCents(toCents(amount));
}

/** Coerces a value that may arrive as a string (PostgreSQL numeric) to a number. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

/** Rounds a decimal rate or percentage (0.3367 -> 0.3367) to six places. */
export function roundPercent(value: number) {
  return Math.round(value * PERCENT_DECIMALS) / PERCENT_DECIMALS;
}

export function totalJobRevenue(inputs: JobFinancialInputs) {
  return fromCents(
    toCents(inputs.contractRevenue) +
      toCents(inputs.changeOrderRevenue) +
      toCents(inputs.otherRevenue) -
      toCents(inputs.creditAmount),
  );
}

export function totalJobCost(inputs: JobFinancialInputs) {
  return fromCents(
    toCents(inputs.materialCost) +
      toCents(inputs.laborCost) +
      toCents(inputs.subcontractorCost) +
      toCents(inputs.otherDirectCost) +
      toCents(inputs.burdenCost) +
      toCents(inputs.warrantyServiceContingency),
  );
}

export function sumAdjustments(
  adjustments: readonly JobAdjustmentInput[],
  adjustmentType: AdjustmentType,
) {
  return fromCents(
    adjustments
      .filter((adjustment) => adjustment.adjustmentType === adjustmentType)
      .reduce((total, adjustment) => total + toCents(adjustment.amount), 0),
  );
}

export function actualTotalRevenue(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
) {
  return roundMoney(totalJobRevenue(inputs) + sumAdjustments(adjustments, "revenue"));
}

export function actualTotalCost(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
) {
  return roundMoney(totalJobCost(inputs) + sumAdjustments(adjustments, "cost"));
}

export function jobGrossProfit(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
) {
  return roundMoney(actualTotalRevenue(inputs, adjustments) - actualTotalCost(inputs, adjustments));
}

/**
 * Zero or negative revenue has no meaningful gross-profit percentage, so it is
 * reported as 0 rather than NaN or Infinity.
 */
export function jobGrossProfitPercent(revenue: number, grossProfit: number) {
  if (!Number.isFinite(revenue) || revenue <= 0) {
    return 0;
  }

  return roundPercent(grossProfit / revenue);
}

export function commissionableRevenue(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
) {
  return roundMoney(
    actualTotalRevenue(inputs, adjustments) +
      sumAdjustments(adjustments, "commissionable_revenue"),
  );
}

export function commissionableCost(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
) {
  return roundMoney(
    actualTotalCost(inputs, adjustments) + sumAdjustments(adjustments, "commissionable_cost"),
  );
}

export function commissionableGrossProfit(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
) {
  return roundMoney(
    commissionableRevenue(inputs, adjustments) - commissionableCost(inputs, adjustments),
  );
}

export function commissionableGrossProfitPercent(
  revenue: number,
  grossProfit: number,
) {
  return jobGrossProfitPercent(revenue, grossProfit);
}

/**
 * Every derived job figure in one call. This is what the Server Actions persist
 * into the derived columns on public.jobs, so the stored numbers and the UI can
 * never disagree with each other.
 */
export function computeJobFinancials(
  inputs: JobFinancialInputs,
  adjustments: readonly JobAdjustmentInput[] = [],
): JobFinancialResults {
  const revenue = actualTotalRevenue(inputs, adjustments);
  const cost = actualTotalCost(inputs, adjustments);
  const grossProfit = roundMoney(revenue - cost);

  const commissionableRev = commissionableRevenue(inputs, adjustments);
  const commissionableCst = commissionableCost(inputs, adjustments);
  const commissionableGp = roundMoney(commissionableRev - commissionableCst);

  return {
    actualTotalRevenue: revenue,
    actualTotalCost: cost,
    jobGrossProfit: grossProfit,
    jobGpPercent: jobGrossProfitPercent(revenue, grossProfit),
    commissionableRevenue: commissionableRev,
    commissionableCost: commissionableCst,
    commissionableGrossProfit: commissionableGp,
    commissionableGpPercent: commissionableGrossProfitPercent(
      commissionableRev,
      commissionableGp,
    ),
  };
}
