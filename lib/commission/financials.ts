import type {
  AdjustmentType,
  JobAdjustmentInput,
  JobFinancialInputs,
  JobFinancialResults,
} from "@/lib/commission/types";
import type { JobRow } from "@/lib/supabase/database.types";

/**
 * The single canonical implementation of Cabinet Genies job financial math.
 *
 * Rules that this module owns:
 *   total job revenue        = contract + change orders + other revenue - credits
 *   direct job cost          = material + labor + subcontractor + other direct
 *   burden cost              = direct job cost x burden percent
 *   warranty contingency     = direct job cost x warranty contingency percent
 *   total job cost           = direct job cost + burden + warranty contingency
 *   actual totals            = the above plus revenue/cost adjustments
 *   job gross profit         = actual total revenue - actual total cost
 *   commissionable revenue   = actual total revenue + commissionable revenue adjustments
 *   commissionable cost      = actual total cost + commissionable cost adjustments
 *   commissionable GP        = commissionable revenue - commissionable cost
 *
 * Percentage base (Phase 3.7): burden and warranty/service contingency are rates
 * applied to DIRECT job cost — the four direct inputs above, before either adder.
 * Neither is applied to revenue: both are cost-side reserves, and a share of
 * revenue would inflate cost on high-revenue jobs. The rates come from
 * configuration (commission_settings) with a per-job snapshot on public.jobs;
 * they are never constants in this module.
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

/**
 * The base both percentage rates apply to: the four direct cost inputs, before
 * burden and warranty / service contingency are added.
 */
export function directJobCost(inputs: JobFinancialInputs) {
  return fromCents(
    toCents(inputs.materialCost) +
      toCents(inputs.laborCost) +
      toCents(inputs.subcontractorCost) +
      toCents(inputs.otherDirectCost),
  );
}

/** A percentage stored as a decimal share, clamped to the valid 0–100% range. */
export function clampPercent(value: number) {
  const numeric = toNumber(value);

  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;

  return numeric;
}

export function calculateBurdenCost(directCost: number, burdenPercent: number) {
  return roundMoney(directCost * clampPercent(burdenPercent));
}

export function calculateWarrantyServiceContingency(
  directCost: number,
  warrantyContingencyPercent: number,
) {
  return roundMoney(directCost * clampPercent(warrantyContingencyPercent));
}

/**
 * Total job cost with burden and warranty / service contingency derived from
 * their percentages — the amounts are never added twice, because they are only
 * ever produced here.
 */
export function totalJobCost(inputs: JobFinancialInputs) {
  const direct = directJobCost(inputs);

  return roundMoney(
    direct +
      calculateBurdenCost(direct, inputs.burdenPercent) +
      calculateWarrantyServiceContingency(direct, inputs.warrantyContingencyPercent),
  );
}

export type JobCostRateDefaults = {
  burdenPercent: number;
  warrantyContingencyPercent: number;
};

export const ZERO_JOB_COST_RATES: JobCostRateDefaults = {
  burdenPercent: 0,
  warrantyContingencyPercent: 0,
};

/**
 * The rates in force for a job: the job's own snapshot when it has one, otherwise
 * the company default. A job that was saved under an older default keeps the rate
 * it was saved with, so later setting changes cannot rewrite its cost structure.
 */
export function jobCostRatesFromRow(
  row: {
    burden_percent: number | null;
    warranty_contingency_percent: number | null;
  },
  defaults: JobCostRateDefaults,
): JobCostRateDefaults {
  return {
    burdenPercent:
      row.burden_percent === null
        ? clampPercent(defaults.burdenPercent)
        : clampPercent(toNumber(row.burden_percent)),
    warrantyContingencyPercent:
      row.warranty_contingency_percent === null
        ? clampPercent(defaults.warrantyContingencyPercent)
        : clampPercent(toNumber(row.warranty_contingency_percent)),
  };
}

/**
 * The revenue and cost inputs from a stored job row, ready for the calculation.
 *
 * The stored `burden_cost` and `warranty_service_contingency` dollars are
 * deliberately **not** read back in: those amounts are derived from the rates, so
 * feeding them in as inputs as well would count them twice. The job's own snapshot
 * rates win; `defaults` (the company settings in force) only fills a job that has
 * never been saved with a rate.
 */
export function jobFinancialInputsFromRow(
  row: JobRow,
  defaults: JobCostRateDefaults = ZERO_JOB_COST_RATES,
): JobFinancialInputs {
  const rates = jobCostRatesFromRow(row, defaults);

  return {
    contractRevenue: toNumber(row.contract_revenue),
    changeOrderRevenue: toNumber(row.change_order_revenue),
    creditAmount: toNumber(row.credit_amount),
    otherRevenue: toNumber(row.other_revenue),
    materialCost: toNumber(row.material_cost),
    laborCost: toNumber(row.labor_cost),
    subcontractorCost: toNumber(row.subcontractor_cost),
    otherDirectCost: toNumber(row.other_direct_cost),
    burdenPercent: rates.burdenPercent,
    warrantyContingencyPercent: rates.warrantyContingencyPercent,
  };
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
  const direct = directJobCost(inputs);
  const burdenPercent = clampPercent(inputs.burdenPercent);
  const warrantyContingencyPercent = clampPercent(inputs.warrantyContingencyPercent);
  const cost = actualTotalCost(inputs, adjustments);
  const grossProfit = roundMoney(revenue - cost);

  const commissionableRev = commissionableRevenue(inputs, adjustments);
  const commissionableCst = commissionableCost(inputs, adjustments);
  const commissionableGp = roundMoney(commissionableRev - commissionableCst);

  return {
    directJobCost: direct,
    burdenCost: calculateBurdenCost(direct, burdenPercent),
    warrantyServiceContingency: calculateWarrantyServiceContingency(
      direct,
      warrantyContingencyPercent,
    ),
    burdenPercent,
    warrantyContingencyPercent,
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
