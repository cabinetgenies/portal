import assert from "node:assert/strict";
import test from "node:test";

import type { TierWindow } from "@/lib/compensation/plan-resolution";
import {
  changeOrderLabel,
  changeOrderTotals,
  changeOrderTotalsFromRows,
} from "@/lib/commission/change-orders";
import { calculateStandardCommissionRate } from "@/lib/commission/engine";
import {
  computeJobFinancials,
  jobFinancialInputsFromRow,
  ZERO_JOB_COST_RATES,
} from "@/lib/commission/financials";
import type { JobChangeOrderRow, JobRow } from "@/lib/supabase/database.types";

/**
 * Phase 3.8: the simplified financial model.
 *
 *   total revenue = original contract price + change order revenue
 *   direct cost   = original costs + change order costs
 *
 * then burden and warranty contingency, then GP and the commission tier. Change
 * orders are child records; the job row only holds their derived roll-up.
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

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-1",
    job_number: null,
    job_name: "Commission test",
    customer_name: null,
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
    material_cost: 0,
    labor_cost: 0,
    subcontractor_cost: 0,
    other_direct_cost: 0,
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
    burden_percent: 0,
    warranty_contingency_percent: 0,
    compensation_plan_id: null,
    compensation_plan_version_id: null,
    created_by: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    ...overrides,
  };
}

function changeOrderRow(
  overrides: Partial<JobChangeOrderRow> & { revenue: number; cost: number },
): JobChangeOrderRow {
  return {
    id: `co-${overrides.revenue}-${overrides.cost}`,
    job_id: "job-1",
    change_order_number: null,
    name: "Change order",
    active: true,
    notes: null,
    created_by: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    ...overrides,
  };
}

/** The job's financials as the canonical function sees them: inputs + roll-up. */
function financialsFor(
  row: JobRow,
  changeOrders: readonly { revenue: number; cost: number; active?: boolean }[],
  rates = ZERO_JOB_COST_RATES,
) {
  const totals = changeOrderTotals(changeOrders);

  return {
    totals,
    results: computeJobFinancials({
      ...jobFinancialInputsFromRow(row, rates),
      changeOrderRevenue: totals.revenue,
      changeOrderCost: totals.cost,
    }),
  };
}

test("1. original contract price and original costs, with no change orders", () => {
  const { results } = financialsFor(jobRow(), []);

  assert.equal(results.actualTotalRevenue, 100_000);
  assert.equal(results.directJobCost, 50_000, "cost before burden and warranty");
  assert.equal(results.jobGrossProfit, 50_000);
  assert.equal(results.jobGpPercent, 0.5);
});

test("2. one change order adds revenue and direct cost", () => {
  const { results, totals } = financialsFor(jobRow(), [{ revenue: 10_000, cost: 4_000 }]);

  assert.equal(totals.count, 1);
  assert.equal(results.actualTotalRevenue, 110_000);
  assert.equal(results.directJobCost, 54_000);
  assert.equal(results.jobGrossProfit, 56_000);
});

test("3. multiple change orders aggregate correctly", () => {
  const { totals, results } = financialsFor(jobRow(), [
    { revenue: 10_000, cost: 4_000 },
    { revenue: 5_000, cost: 1_000 },
    { revenue: 2_500, cost: 500 },
  ]);

  assert.equal(totals.count, 3);
  assert.equal(totals.revenue, 17_500);
  assert.equal(totals.cost, 5_500);
  assert.equal(results.actualTotalRevenue, 117_500);
  assert.equal(results.directJobCost, 55_500);
});

test("4. editing a change order updates the totals", () => {
  const before = financialsFor(jobRow(), [{ revenue: 10_000, cost: 4_000 }]);
  const after = financialsFor(jobRow(), [{ revenue: 25_000, cost: 9_000 }]);

  assert.equal(before.results.actualTotalRevenue, 110_000);
  assert.equal(after.results.actualTotalRevenue, 125_000);
  assert.equal(after.results.directJobCost, 59_000);
  assert.notEqual(before.results.directJobCost, after.results.directJobCost);
});

test("5. removing (deactivating) a change order updates the totals", () => {
  const rows = [
    changeOrderRow({ id: "co-1", revenue: 10_000, cost: 4_000 }),
    changeOrderRow({ id: "co-2", revenue: 5_000, cost: 1_000, active: false }),
  ];

  const totals = changeOrderTotalsFromRows(rows);

  assert.equal(totals.count, 1, "only active change orders count");
  assert.equal(totals.revenue, 10_000);
  assert.equal(totals.cost, 4_000);

  // The row is kept, so the history still shows what was voided.
  assert.equal(rows.length, 2);
});

test("6. change order costs affect gross profit", () => {
  const withoutCost = financialsFor(jobRow(), [{ revenue: 10_000, cost: 0 }]);
  const withCost = financialsFor(jobRow(), [{ revenue: 10_000, cost: 6_000 }]);

  assert.equal(withoutCost.results.jobGrossProfit, 60_000);
  assert.equal(withCost.results.jobGrossProfit, 54_000);
  assert.ok(withCost.results.jobGrossProfit < withoutCost.results.jobGrossProfit);
});

test("7. change order revenue affects gross profit", () => {
  const smaller = financialsFor(jobRow(), [{ revenue: 5_000, cost: 4_000 }]);
  const larger = financialsFor(jobRow(), [{ revenue: 20_000, cost: 4_000 }]);

  assert.equal(smaller.results.jobGrossProfit, 51_000);
  assert.equal(larger.results.jobGrossProfit, 66_000);
});

test("8. change orders can move the job across a commission tier boundary", () => {
  // 50% GP → 30%. A change order with more cost than revenue lowers GP enough to
  // drop into the 45–50% band.
  const clean = financialsFor(jobRow(), []);
  const withCostlyChangeOrder = financialsFor(jobRow(), [
    { revenue: 2_000, cost: 4_000 },
  ]);

  assert.equal(clean.results.commissionableGpPercent, 0.5);
  assert.equal(
    calculateStandardCommissionRate(
      clean.results.commissionableGpPercent,
      PRODUCTION_TIERS,
      0.36,
    ),
    0.3,
  );
  assert.equal(withCostlyChangeOrder.results.commissionableGpPercent, 0.470588);
  assert.equal(
    calculateStandardCommissionRate(
      withCostlyChangeOrder.results.commissionableGpPercent,
      PRODUCTION_TIERS,
      0.36,
    ),
    0.2,
  );
});

test("9. a commission event already recognized keeps its own figures", () => {
  // What a paid deposit event stores: the figures it was calculated from.
  const beforeEdit = financialsFor(jobRow(), [{ revenue: 10_000, cost: 4_000 }]);
  const paidEventSnapshot = {
    commissionableGp: beforeEdit.results.commissionableGrossProfit,
    commissionableGpPercent: beforeEdit.results.commissionableGpPercent,
    standardRate: calculateStandardCommissionRate(
      beforeEdit.results.commissionableGpPercent,
      PRODUCTION_TIERS,
      0.36,
    ),
  };

  // The change order is edited afterwards.
  const afterEdit = financialsFor(jobRow(), [{ revenue: 10_000, cost: 20_000 }]);

  // The job's live figures moved …
  assert.notEqual(
    afterEdit.results.commissionableGrossProfit,
    paidEventSnapshot.commissionableGp,
  );
  // … but the stored event still reproduces its own snapshot exactly, because a
  // paid event is never recalculated from the job.
  assert.equal(paidEventSnapshot.commissionableGp, 56_000);
  assert.equal(paidEventSnapshot.standardRate, 0.3);
  assert.equal(
    calculateStandardCommissionRate(
      paidEventSnapshot.commissionableGpPercent,
      PRODUCTION_TIERS,
      0.36,
    ),
    paidEventSnapshot.standardRate,
  );
});

test("10. nothing is aggregated twice", () => {
  // A legacy row that still carries its detail in the old cost buckets: the
  // canonical inputs read original_cost only, so the same money is not counted twice.
  const legacyRow = jobRow({
    original_cost: 50_000,
    material_cost: 30_000,
    labor_cost: 20_000,
  });
  const inputs = jobFinancialInputsFromRow(legacyRow, ZERO_JOB_COST_RATES);

  assert.equal(inputs.originalCost, 50_000);
  assert.equal("materialCost" in inputs, false);
  assert.equal(computeJobFinancials(inputs).directJobCost, 50_000);

  // A job row that already stores a roll-up is overridden by the rows themselves,
  // so the aggregate has exactly one source. (The Server Action does this override;
  // this asserts the totals helper is that source.)
  const rows = [
    changeOrderRow({ id: "co-1", revenue: 10_000, cost: 4_000 }),
    changeOrderRow({ id: "co-2", revenue: 5_000, cost: 1_000 }),
  ];
  const storedRollUp = jobRow({ change_order_revenue: 999_999, change_order_cost: 999_999 });
  const { results } = financialsFor(storedRollUp, rows);

  assert.equal(changeOrderTotalsFromRows(rows).revenue, 15_000);
  assert.equal(results.actualTotalRevenue, 115_000, "the stored roll-up is ignored");
  assert.equal(results.directJobCost, 55_000);
});

test("change order labels fall back sensibly", () => {
  assert.equal(
    changeOrderLabel({ name: "Extra cabinets", change_order_number: "CO-2" }),
    "CO-2 · Extra cabinets",
  );
  assert.equal(changeOrderLabel({ name: "", change_order_number: "CO-3" }), "CO-3");
  assert.equal(changeOrderLabel({ name: "Extra", change_order_number: null }), "Extra");
});
