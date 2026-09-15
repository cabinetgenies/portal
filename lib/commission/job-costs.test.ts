import assert from "node:assert/strict";
import test from "node:test";

import { commissionSettingsSchema } from "@/lib/compensation/validation";
import type { TierWindow } from "@/lib/compensation/plan-resolution";
import { calculateStandardCommissionRate } from "@/lib/commission/engine";
import {
  calculateBurdenCost,
  calculateWarrantyServiceContingency,
  computeJobFinancials,
  directJobCost,
  jobCostRatesFromRow,
  jobFinancialInputsFromRow,
  totalJobCost,
  ZERO_JOB_COST_RATES,
} from "@/lib/commission/financials";
import { costRateValuesToDecimals } from "@/lib/commission/job-entry";
import {
  EMPTY_JOB_FINANCIAL_INPUTS,
  type JobFinancialInputs,
} from "@/lib/commission/types";
import { jobEntrySchema } from "@/lib/commission/validation";
import type { JobRow } from "@/lib/supabase/database.types";

/**
 * Phase 3.7: percentage-based burden and warranty / service contingency.
 *
 * The rule under test: both rates apply to DIRECT job cost (material + labor +
 * subcontractor + other direct), before either is added, and both are inside total
 * job cost before the commission tier is selected.
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

/** 100,000 revenue over 50,000 of direct cost — the documented 50 GP test job. */
function job(
  overrides: Partial<JobFinancialInputs> = {},
): JobFinancialInputs {
  return {
    ...EMPTY_JOB_FINANCIAL_INPUTS,
    contractRevenue: 100_000,
    originalCost: 50_000,
    ...overrides,
  };
}

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    job_number: null,
    job_name: "Commission Test 50 GP",
    customer_name: null,
    // Dormant since Phase 4.1 — a commission job no longer belongs to a category.
    project_category_id: null,
    status: "sold",
    sales_designer_id: null,
    sold_date: "2026-09-15",
    deposit_received_date: null,
    completion_date: null,
    gp_audit_completed_date: null,
    contract_revenue: 100_000,
    change_order_revenue: 0,
    credit_amount: 0,
    other_revenue: 0,
    material_cost: 30_000,
    labor_cost: 12_000,
    subcontractor_cost: 5_000,
    other_direct_cost: 3_000,
    original_cost: 50_000,
    change_order_cost: 0,
    burden_cost: 0,
    warranty_service_contingency: 0,
    actual_total_revenue: 100_000,
    actual_total_cost: 50_000,
    job_gross_profit: 50_000,
    job_gp_percent: 0.5,
    commissionable_revenue: 100_000,
    commissionable_cost: 50_000,
    commissionable_gross_profit: 50_000,
    commissionable_gp_percent: 0.5,
    burden_percent: null,
    warranty_contingency_percent: null,
    compensation_plan_id: null,
    compensation_plan_version_id: null,
    created_by: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The rates themselves
// ---------------------------------------------------------------------------

test("a 10% burden rate is 10% of direct job cost", () => {
  const inputs = job({ burdenPercent: 0.1 });

  assert.equal(directJobCost(inputs), 50_000);
  assert.equal(calculateBurdenCost(directJobCost(inputs), 0.1), 5_000);
  assert.equal(totalJobCost(inputs), 55_000);
  assert.equal(computeJobFinancials(inputs).burdenCost, 5_000);
});

test("a 5% warranty contingency is 5% of direct job cost", () => {
  const inputs = job({ warrantyContingencyPercent: 0.05 });

  assert.equal(calculateWarrantyServiceContingency(50_000, 0.05), 2_500);
  assert.equal(totalJobCost(inputs), 52_500);
  assert.equal(computeJobFinancials(inputs).warrantyServiceContingency, 2_500);
});

test("both percentages are applied together to the same direct cost base", () => {
  const inputs = job({ burdenPercent: 0.1, warrantyContingencyPercent: 0.05 });
  const results = computeJobFinancials(inputs);

  assert.equal(results.directJobCost, 50_000);
  assert.equal(results.burdenCost, 5_000);
  assert.equal(results.warrantyServiceContingency, 2_500);
  assert.equal(results.actualTotalCost, 57_500);
  assert.equal(results.jobGrossProfit, 42_500);
});

test("decimal percentages are honoured", () => {
  const inputs = job({ burdenPercent: 0.075, warrantyContingencyPercent: 0.025 });
  const results = computeJobFinancials(inputs);

  assert.equal(results.burdenCost, 3_750);
  assert.equal(results.warrantyServiceContingency, 1_250);
  assert.equal(results.actualTotalCost, 55_000);

  // The job form exchanges percent points; 7.5 points is 0.075.
  assert.deepEqual(
    costRateValuesToDecimals({ burdenPercent: "7.5", warrantyContingencyPercent: "2.5" }),
    { burdenPercent: 0.075, warrantyContingencyPercent: 0.025 },
  );
});

test("zero percent adds nothing, with or without a stored rate", () => {
  const zeroRates = job({ burdenPercent: 0, warrantyContingencyPercent: 0 });
  const results = computeJobFinancials(zeroRates);

  assert.equal(results.burdenCost, 0);
  assert.equal(results.warrantyServiceContingency, 0);
  assert.equal(results.actualTotalCost, 50_000);

  // A job saved before this phase has no rates at all; the defaults are 0%.
  const legacyRow = jobRow();
  const inputs = jobFinancialInputsFromRow(legacyRow, ZERO_JOB_COST_RATES);

  assert.equal(inputs.burdenPercent, 0);
  assert.equal(inputs.warrantyContingencyPercent, 0);
  assert.equal(totalJobCost(inputs), 50_000);
});

// ---------------------------------------------------------------------------
// Effect on GP, the tier and the commission
// ---------------------------------------------------------------------------

test("changing the burden percentage changes GP", () => {
  const withoutBurden = computeJobFinancials(job({ burdenPercent: 0 }));
  const withBurden = computeJobFinancials(job({ burdenPercent: 0.1 }));

  assert.equal(withoutBurden.jobGrossProfit, 50_000);
  assert.equal(withBurden.jobGrossProfit, 45_000);
  assert.ok(withBurden.jobGrossProfit < withoutBurden.jobGrossProfit);
});

test("changing the warranty percentage changes GP", () => {
  const withoutWarranty = computeJobFinancials(job({ warrantyContingencyPercent: 0 }));
  const withWarranty = computeJobFinancials(job({ warrantyContingencyPercent: 0.05 }));

  assert.equal(withoutWarranty.jobGrossProfit, 50_000);
  assert.equal(withWarranty.jobGrossProfit, 47_500);
});

test("the derived cost lowers GP before tier selection, so it can change the tier", () => {
  const noRates = computeJobFinancials(job({ burdenPercent: 0, warrantyContingencyPercent: 0 }));
  const withRates = computeJobFinancials(
    job({ burdenPercent: 0.05, warrantyContingencyPercent: 0.05 }),
  );

  // 50% GP → 30%; 45% GP → 20%. The rates moved the job across the 45% boundary.
  assert.equal(noRates.commissionableGpPercent, 0.5);
  assert.equal(calculateStandardCommissionRate(noRates.commissionableGpPercent, PRODUCTION_TIERS, 0.36), 0.3);
  assert.equal(withRates.commissionableGpPercent, 0.45);
  assert.equal(
    calculateStandardCommissionRate(withRates.commissionableGpPercent, PRODUCTION_TIERS, 0.36),
    0.2,
  );
});

test("the 50% GP boundary still behaves correctly", () => {
  // Exactly 50% stays in the top band.
  const exactlyFifty = computeJobFinancials(job({ burdenPercent: 0 }));
  assert.equal(exactlyFifty.commissionableGpPercent, 0.5);
  assert.equal(
    calculateStandardCommissionRate(exactlyFifty.commissionableGpPercent, PRODUCTION_TIERS, 0.36),
    0.3,
  );

  // Any burden at all lifts cost and drops the job out of the top band.
  const justUnder = computeJobFinancials(job({ burdenPercent: 0.0001 }));
  assert.equal(justUnder.commissionableGpPercent, 0.49995);
  assert.equal(
    calculateStandardCommissionRate(justUnder.commissionableGpPercent, PRODUCTION_TIERS, 0.36),
    0.2,
  );
});

// ---------------------------------------------------------------------------
// No double counting
// ---------------------------------------------------------------------------

test("a stored burden_cost is not fed back in as an input", () => {
  const row = jobRow({ burden_percent: 0.1, burden_cost: 5_000 });
  const inputs = jobFinancialInputsFromRow(row, ZERO_JOB_COST_RATES);

  assert.equal("burdenCost" in inputs, false);
  assert.equal(inputs.burdenPercent, 0.1);
  // 50,000 direct + 5,000 burden — added once, not twice.
  assert.equal(totalJobCost(inputs), 55_000);
  assert.equal(computeJobFinancials(inputs).actualTotalCost, 55_000);
});

test("a stored warranty_service_contingency is not fed back in as an input", () => {
  const row = jobRow({ warranty_contingency_percent: 0.05, warranty_service_contingency: 2_500 });
  const inputs = jobFinancialInputsFromRow(row, ZERO_JOB_COST_RATES);

  assert.equal("warrantyServiceContingency" in inputs, false);
  assert.equal(inputs.warrantyContingencyPercent, 0.05);
  assert.equal(totalJobCost(inputs), 52_500);
});

test("a job whose stored dollars disagree with its rate recalculates from the rate", () => {
  // Legacy row: 4,000 of burden left over from the dollar-entry era, with the rate
  // the migration derived from it. The rate is the input; the dollars are output.
  const row = jobRow({ burden_percent: 0.08, burden_cost: 4_000 });
  const inputs = jobFinancialInputsFromRow(row, ZERO_JOB_COST_RATES);
  const results = computeJobFinancials(inputs);

  assert.equal(results.burdenCost, 4_000);
  assert.equal(results.actualTotalCost, 54_000);
});

// ---------------------------------------------------------------------------
// Historical protection and validation
// ---------------------------------------------------------------------------

test("a later change to the company percentages does not rewrite a saved job", () => {
  const savedRow = jobRow({
    burden_percent: 0.1,
    warranty_contingency_percent: 0.05,
    burden_cost: 5_000,
    warranty_service_contingency: 2_500,
    actual_total_cost: 57_500,
    job_gross_profit: 42_500,
    job_gp_percent: 0.425,
    commissionable_cost: 57_500,
    commissionable_gross_profit: 42_500,
    commissionable_gp_percent: 0.425,
  });

  // The company default is changed to 25% each, well after the job was saved.
  const newCompanyDefaults = { burdenPercent: 0.25, warrantyContingencyPercent: 0.25 };
  const rates = jobCostRatesFromRow(savedRow, newCompanyDefaults);

  assert.deepEqual(rates, { burdenPercent: 0.1, warrantyContingencyPercent: 0.05 });

  // Recomputing the job reproduces the stored figures exactly.
  const recomputed = computeJobFinancials(
    jobFinancialInputsFromRow(savedRow, newCompanyDefaults),
  );

  assert.equal(recomputed.actualTotalCost, 57_500);
  assert.equal(recomputed.jobGrossProfit, 42_500);
  assert.equal(recomputed.jobGpPercent, 0.425);
  // …so the tier the commission event snapshotted is unchanged too.
  assert.equal(
    calculateStandardCommissionRate(recomputed.commissionableGpPercent, PRODUCTION_TIERS, 0.36),
    0.1,
  );

  // A job entered after the change would land somewhere else entirely.
  const newJob = computeJobFinancials(
    job({ burdenPercent: 0.25, warrantyContingencyPercent: 0.25 }),
  );
  assert.equal(newJob.commissionableGpPercent, 0.25);
  assert.notEqual(newJob.actualTotalCost, recomputed.actualTotalCost);
});

test("negative percentages are rejected", () => {
  const settings = commissionSettingsSchema.safeParse({
    effectiveFrom: "2026-09-15",
    depositPayoutPercent: 50,
    drawRateReduction: 5,
    drawEnabled: "on",
    burdenPercent: -1,
    warrantyContingencyPercent: 5,
  });

  assert.equal(settings.success, false);
  assert.deepEqual(
    settings.success ? [] : settings.error.issues.map((issue) => issue.path.join(".")),
    ["burdenPercent"],
  );

  const entry = jobEntrySchema.safeParse({
    jobName: "Commission Test 50 GP",
    status: "sold",
    soldDate: "2026-09-15",
    contractRevenue: "100000",
    originalCost: "50000",
    burdenPercent: "-5",
    warrantyContingencyPercent: "5",
  });

  assert.equal(entry.success, false);
});

test("percentages above the maximum are rejected", () => {
  const settings = commissionSettingsSchema.safeParse({
    effectiveFrom: "2026-09-15",
    depositPayoutPercent: 50,
    drawRateReduction: 5,
    drawEnabled: "on",
    burdenPercent: 10,
    warrantyContingencyPercent: 101,
  });

  assert.equal(settings.success, false);
  assert.deepEqual(
    settings.success ? [] : settings.error.issues.map((issue) => issue.path.join(".")),
    ["warrantyContingencyPercent"],
  );

  const entry = jobEntrySchema.safeParse({
    jobName: "Commission Test 50 GP",
    status: "sold",
    soldDate: "2026-09-15",
    contractRevenue: "100000",
    originalCost: "50000",
    burdenPercent: "150",
    warrantyContingencyPercent: "5",
  });

  assert.equal(entry.success, false);
});

test("a blank percentage means 'use the company default', not zero", () => {
  const parsed = jobEntrySchema.safeParse({
    jobName: "Commission Test 50 GP",
    status: "sold",
    soldDate: "2026-09-15",
    contractRevenue: "100000",
    originalCost: "50000",
    burdenPercent: "",
    warrantyContingencyPercent: "5",
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success ? parsed.data.burdenPercent : "unset", null);
  assert.equal(parsed.success ? parsed.data.warrantyContingencyPercent : "unset", 5);
});
