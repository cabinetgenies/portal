import assert from "node:assert/strict";
import test from "node:test";

import {
  actualTotalCost,
  actualTotalRevenue,
  calculateBurdenCost,
  calculateWarrantyServiceContingency,
  commissionableCost,
  commissionableGrossProfit,
  commissionableGrossProfitPercent,
  commissionableRevenue,
  computeJobFinancials,
  directJobCost,
  jobGrossProfit,
  jobGrossProfitPercent,
  roundMoney,
  totalJobCost,
  totalJobRevenue,
} from "@/lib/commission/financials";
import {
  EMPTY_JOB_FINANCIAL_INPUTS,
  type JobAdjustmentInput,
  type JobFinancialInputs,
} from "@/lib/commission/types";

const inputs = (
  overrides: Partial<JobFinancialInputs> = {},
): JobFinancialInputs => ({
  ...EMPTY_JOB_FINANCIAL_INPUTS,
  ...overrides,
});

test("total job revenue adds contract, change orders and other revenue", () => {
  const job = inputs({
    contractRevenue: 40_000,
    changeOrderRevenue: 2_500,
    otherRevenue: 500,
  });

  assert.equal(totalJobRevenue(job), 43_000);
});

test("credits reduce total job revenue", () => {
  const job = inputs({
    contractRevenue: 40_000,
    changeOrderRevenue: 2_500,
    otherRevenue: 500,
    creditAmount: 1_200,
  });

  assert.equal(totalJobRevenue(job), 41_800);
});

test("total job cost is direct cost plus the derived burden and warranty contingency", () => {
  const job = inputs({
    materialCost: 12_000,
    laborCost: 8_000,
    subcontractorCost: 3_000,
    otherDirectCost: 750,
    burdenPercent: 0.1,
    warrantyContingencyPercent: 0.05,
  });

  assert.equal(directJobCost(job), 23_750);
  assert.equal(calculateBurdenCost(23_750, 0.1), 2_375);
  assert.equal(calculateWarrantyServiceContingency(23_750, 0.05), 1_187.5);
  assert.equal(totalJobCost(job), 27_312.5);
});

test("job gross profit is revenue minus cost and is independent of commission rules", () => {
  const job = inputs({
    contractRevenue: 30_000,
    materialCost: 10_000,
    laborCost: 8_000,
  });

  assert.equal(jobGrossProfit(job), 12_000);
});

test("job gross profit percentage is gross profit over revenue", () => {
  const job = inputs({
    contractRevenue: 30_000,
    materialCost: 10_000,
    laborCost: 8_000,
  });

  assert.equal(jobGrossProfitPercent(totalJobRevenue(job), jobGrossProfit(job)), 0.4);
});

test("zero revenue reports a 0% gross profit percentage instead of NaN or Infinity", () => {
  assert.equal(jobGrossProfitPercent(0, 0), 0);
  assert.equal(jobGrossProfitPercent(0, -500), 0);

  const empty = computeJobFinancials(EMPTY_JOB_FINANCIAL_INPUTS);
  assert.equal(empty.jobGpPercent, 0);
  assert.equal(empty.commissionableGpPercent, 0);
  assert.equal(empty.jobGrossProfit, 0);
});

test("a negative gross profit produces a negative percentage, not a clamped one", () => {
  const job = inputs({ contractRevenue: 10_000, materialCost: 12_000 });
  const revenue = totalJobRevenue(job);
  const grossProfit = jobGrossProfit(job);

  assert.equal(grossProfit, -2_000);
  assert.equal(jobGrossProfitPercent(revenue, grossProfit), -0.2);
});

test("money arithmetic keeps cents exact across many components", () => {
  const job = inputs({
    contractRevenue: 0.1,
    changeOrderRevenue: 0.2,
    materialCost: 0.3,
  });

  assert.equal(totalJobRevenue(job), 0.3);
  assert.equal(totalJobCost(job), 0.3);
  assert.equal(jobGrossProfit(job), 0);
  assert.equal(roundMoney(1.005), 1.01);
});

test("revenue adjustments change the actual total and the gross profit", () => {
  const job = inputs({ contractRevenue: 20_000, materialCost: 8_000 });
  const adjustments: JobAdjustmentInput[] = [{ adjustmentType: "revenue", amount: 1_500 }];

  assert.equal(actualTotalRevenue(job, adjustments), 21_500);
  assert.equal(jobGrossProfit(job, adjustments), 13_500);
});

test("cost adjustments change the actual total and the gross profit", () => {
  const job = inputs({ contractRevenue: 20_000, materialCost: 8_000 });
  const adjustments: JobAdjustmentInput[] = [{ adjustmentType: "cost", amount: 2_500 }];

  assert.equal(actualTotalCost(job, adjustments), 10_500);
  assert.equal(jobGrossProfit(job, adjustments), 9_500);
});

test("commissionable gross profit equals job gross profit when nothing is excluded", () => {
  const job = inputs({
    contractRevenue: 50_000,
    changeOrderRevenue: 5_000,
    materialCost: 20_000,
    laborCost: 10_000,
    burdenPercent: 0.1,
    warrantyContingencyPercent: 0.05,
  });

  const results = computeJobFinancials(job);

  assert.equal(results.commissionableRevenue, results.actualTotalRevenue);
  assert.equal(results.commissionableCost, results.actualTotalCost);
  assert.equal(results.commissionableGrossProfit, results.jobGrossProfit);
  assert.equal(results.commissionableGpPercent, results.jobGpPercent);
});

test("explicit exclusions reduce commissionable gross profit without touching job gross profit", () => {
  const job = inputs({
    contractRevenue: 50_000,
    materialCost: 20_000,
    laborCost: 10_000,
    burdenPercent: 0.1,
  });

  // Cost is excluded from the commission base here because the business said so,
  // not because the calculation hardcodes it.
  const adjustments: JobAdjustmentInput[] = [
    { adjustmentType: "commissionable_revenue", amount: -2_000 },
    { adjustmentType: "commissionable_cost", amount: -1_000 },
  ];

  const results = computeJobFinancials(job, adjustments);

  // direct 30,000 + 10% burden = 33,000 cost
  assert.equal(results.jobGrossProfit, 17_000);
  assert.equal(results.commissionableRevenue, 48_000);
  assert.equal(results.commissionableCost, 32_000);
  assert.equal(results.commissionableGrossProfit, 16_000);
  assert.equal(commissionableGrossProfit(job, adjustments), 16_000);
  assert.equal(commissionableRevenue(job, adjustments), 48_000);
  assert.equal(commissionableCost(job, adjustments), 32_000);
});

test("a pure commissionable exclusion lowers commissionable GP below job GP", () => {
  const job = inputs({ contractRevenue: 10_000, materialCost: 4_000 });
  const adjustments: JobAdjustmentInput[] = [
    { adjustmentType: "commissionable_revenue", amount: -1_000 },
  ];

  const results = computeJobFinancials(job, adjustments);

  assert.equal(results.jobGrossProfit, 6_000);
  assert.equal(results.commissionableGrossProfit, 5_000);
  assert.equal(results.commissionableGpPercent, 0.555556);
});

test("commissionable gross profit percentage follows the same zero-revenue rule", () => {
  assert.equal(commissionableGrossProfitPercent(0, 0), 0);
  assert.equal(commissionableGrossProfitPercent(48_000, 19_000), 0.395833);
});

test("computeJobFinancials is the single source of every derived figure", () => {
  const job = inputs({
    contractRevenue: 100_000,
    changeOrderRevenue: 10_000,
    creditAmount: 5_000,
    otherRevenue: 2_000,
    materialCost: 30_000,
    laborCost: 25_000,
    subcontractorCost: 5_000,
    otherDirectCost: 1_000,
    burdenPercent: 0.1,
    warrantyContingencyPercent: 0.05,
  });

  const results = computeJobFinancials(job);

  assert.deepEqual(results, {
    directJobCost: 61_000,
    burdenCost: 6_100,
    warrantyServiceContingency: 3_050,
    burdenPercent: 0.1,
    warrantyContingencyPercent: 0.05,
    actualTotalRevenue: 107_000,
    actualTotalCost: 70_150,
    jobGrossProfit: 36_850,
    jobGpPercent: 0.344393,
    commissionableRevenue: 107_000,
    commissionableCost: 70_150,
    commissionableGrossProfit: 36_850,
    commissionableGpPercent: 0.344393,
  });
});
