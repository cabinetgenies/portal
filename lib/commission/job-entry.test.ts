import assert from "node:assert/strict";
import test from "node:test";

import type { TierWindow } from "@/lib/compensation/plan-resolution";
import type { CommissionSettingsSnapshot } from "@/lib/commission/engine";
import {
  buildJobEntryLiveCalculation,
  buildJobEntryOptions,
  emptyJobMoneyValues,
  jobFinancialInputsFromValues,
  jobMoneyValuesFromJob,
  type JobCostRateValues,
  type JobMoneyValues,
} from "@/lib/commission/job-entry";
import type { ChangeOrderTotalsInput } from "@/lib/commission/change-orders";
import type {
  CompensationPlanRow,
  CompensationPlanVersionRow,
  EmployeeCompensationAssignmentRow,
  EmployeeDrawPeriodRow,
  JobRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

const TODAY = "2026-09-15";

/** The tiers seeded by the production plan (`Cabinet Genies Standard GP Commission`). */
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

const ZERO_RATES: JobCostRateValues = {
  burdenPercent: "0",
  warrantyContingencyPercent: "0",
};

function values(overrides: Partial<JobMoneyValues> = {}): JobMoneyValues {
  return { ...emptyJobMoneyValues(), ...overrides };
}

function preview(
  money: Partial<JobMoneyValues>,
  options: {
    tiers?: TierWindow[];
    onDraw?: boolean;
    settings?: CommissionSettingsSnapshot;
    rateValues?: JobCostRateValues;
    changeOrders?: ChangeOrderTotalsInput[];
    previouslyRecognized?: number;
  } = {},
) {
  return buildJobEntryLiveCalculation({
    values: values(money),
    rateValues: options.rateValues ?? ZERO_RATES,
    changeOrders: options.changeOrders ?? [],
    tiers: options.tiers ?? PRODUCTION_TIERS,
    minimumGpStandard: 0,
    settings: options.settings ?? SETTINGS,
    onDraw: options.onDraw ?? false,
    previouslyRecognized: options.previouslyRecognized ?? 0,
  });
}

test("the documented 50 GP test case produces 30% and a $7,500 deposit target", () => {
  const result = preview({ contractRevenue: "100000", originalCost: "50000" });

  assert.equal(result.revenue.originalContractPrice, 100000);
  assert.equal(result.revenue.changeOrderRevenue, 0);
  assert.equal(result.revenue.totalRevenue, 100000);
  assert.equal(result.cost.originalCost, 50000);
  assert.equal(result.cost.changeOrderCost, 0);
  assert.equal(result.cost.directJobCost, 50000);
  assert.equal(result.cost.totalCost, 50000);
  assert.equal(result.profit.grossProfit, 50000);
  assert.equal(result.profit.grossProfitPercent, 0.5);
  assert.equal(result.commission.commissionableGrossProfit, 50000);
  assert.equal(result.commission.commissionableGpPercent, 0.5);
  assert.equal(result.commission.tierLabel, "50% GP and above");
  assert.equal(result.commission.standardRate, 0.3);
  assert.equal(result.commission.drawReduction, 0);
  assert.equal(result.commission.effectiveRate, 0.3);
  assert.equal(result.commission.projectedGrossCommission, 15000);
  assert.equal(result.commission.depositTarget, 7500);
  assert.equal(result.commission.estimatedRemaining, 15000);
  assert.deepEqual([...result.warnings], []);
});

test("change orders are inside direct cost, before burden and warranty", () => {
  const result = preview(
    { contractRevenue: "100000", originalCost: "46000" },
    {
      rateValues: { burdenPercent: "10", warrantyContingencyPercent: "5" },
      changeOrders: [{ revenue: 10000, cost: 4000 }],
    },
  );

  assert.equal(result.revenue.changeOrderRevenue, 10000);
  assert.equal(result.revenue.totalRevenue, 110000);
  assert.equal(result.cost.originalCost, 46000);
  assert.equal(result.cost.changeOrderCost, 4000);
  // direct = 46,000 + 4,000; burden = 10% of 50,000; warranty = 5% of 50,000
  assert.equal(result.cost.directJobCost, 50000);
  assert.equal(result.cost.burdenCost, 5000);
  assert.equal(result.cost.warrantyServiceContingency, 2500);
  assert.equal(result.cost.totalCost, 57500);
  assert.equal(result.profit.grossProfit, 52500);
});

test("band boundaries resolve to the tier the engine would use", () => {
  const rate = (contract: string, cost: string) =>
    preview({ contractRevenue: contract, originalCost: cost }).commission.standardRate;

  assert.equal(rate("100000", "50000"), 0.3);
  assert.equal(rate("100000", "50001"), 0.2, "49.999% must not fall into the 50% band");
  assert.equal(rate("100000", "55000"), 0.2);
  assert.equal(rate("100000", "55010"), 0.1);
  assert.equal(rate("100000", "65000"), 0.1);
  assert.equal(rate("100000", "65010"), 0);
});

test("draw lowers the rate by points, never by a multiple", () => {
  const onDraw = preview(
    { contractRevenue: "100000", originalCost: "50000" },
    { onDraw: true },
  );

  assert.equal(onDraw.commission.standardRate, 0.3);
  assert.equal(onDraw.commission.drawReduction, 0.05);
  assert.equal(onDraw.commission.effectiveRate, 0.25);
  assert.equal(onDraw.commission.projectedGrossCommission, 12500);
  assert.equal(onDraw.commission.depositTarget, 6250);

  const drawDisabled = preview(
    { contractRevenue: "100000", originalCost: "50000" },
    { onDraw: true, settings: { ...SETTINGS, drawEnabled: false } },
  );

  assert.equal(drawDisabled.commission.drawReduction, 0);
  assert.equal(drawDisabled.commission.effectiveRate, 0.3);
});

test("recognized commission reduces the estimate and can warn about a rollover", () => {
  const partiallyPaid = preview(
    { contractRevenue: "100000", originalCost: "50000" },
    { previouslyRecognized: 7500 },
  );

  assert.equal(partiallyPaid.commission.projectedGrossCommission, 15000);
  assert.equal(partiallyPaid.commission.previouslyRecognized, 7500);
  assert.equal(partiallyPaid.commission.estimatedRemaining, 7500);
  assert.deepEqual([...partiallyPaid.warnings], []);

  const overRecognized = preview(
    { contractRevenue: "100000", originalCost: "50000" },
    { previouslyRecognized: 9000 },
  );

  assert.equal(overRecognized.commission.estimatedRemaining, 6000);
  const worse = preview(
    { contractRevenue: "100000", originalCost: "60000" },
    { previouslyRecognized: 9000 },
  );
  assert.equal(worse.commission.estimatedRemaining, -5000);
  assert.equal(worse.warnings.length, 1);
  assert.match(String(worse.warnings[0]), /rollover/i);
});

test("a job without tiers still totals correctly and says why there is no commission", () => {
  const result = preview(
    { contractRevenue: "100000", originalCost: "50000" },
    { tiers: [] },
  );

  assert.equal(result.commission.hasTiers, false);
  assert.equal(result.commission.commissionableGrossProfit, 50000);
  assert.equal(result.commission.standardRate, 0);
  assert.equal(result.commission.projectedGrossCommission, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(String(result.warnings[0]), /plan version/i);
});

test("money values round-trip from a stored job back into the inputs", () => {
  const job = {
    contract_revenue: "100000.00",
    original_cost: "50000.00",
    other_revenue: "0.00",
    credit_amount: "0.00",
    change_order_revenue: "0.00",
    change_order_cost: "0.00",
    burden_percent: null,
    warranty_contingency_percent: null,
  } as unknown as JobRow;

  const roundTripped = preview(jobMoneyValuesFromJob(job));

  assert.equal(roundTripped.commission.projectedGrossCommission, 15000);
  assert.equal(
    jobFinancialInputsFromValues(jobMoneyValuesFromJob(job), {
      burdenPercent: 0,
      warrantyContingencyPercent: 0,
    }).originalCost,
    50000,
  );
});

// ---------------------------------------------------------------------------
// Form options
// ---------------------------------------------------------------------------

function profile(overrides: Partial<ProfileRow> & { id: string }): ProfileRow {
  return {
    email: `${overrides.id}@cabinetgenies.com`,
    first_name: null,
    last_name: null,
    display_name: null,
    role: "employee",
    department: null,
    department_id: null,
    business_role_id: null,
    manager_id: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function plan(id: string, participantKind: string, name: string): CompensationPlanRow {
  return {
    id,
    name,
    description: null,
    participant_kind: participantKind,
    plan_type: "straight_gp",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function version(
  id: string,
  planId: string,
  overrides: Partial<CompensationPlanVersionRow> = {},
): CompensationPlanVersionRow {
  return {
    id,
    compensation_plan_id: planId,
    version_name: `v-${id}`,
    effective_from: "2026-01-01",
    effective_to: null,
    active: true,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assignment(
  profileId: string,
  planId: string,
  effectiveFrom: string,
): EmployeeCompensationAssignmentRow {
  return {
    id: `assignment-${profileId}`,
    profile_id: profileId,
    compensation_plan_id: planId,
    effective_from: effectiveFrom,
    effective_to: null,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function drawPeriod(profileId: string, from: string): EmployeeDrawPeriodRow {
  return {
    id: `draw-${profileId}`,
    profile_id: profileId,
    effective_from: from,
    effective_to: null,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("the job form defaults a designer's plan from the assignment in force today", () => {
  const options = buildJobEntryOptions({
    profiles: [
      profile({ id: "designer", first_name: "Dana", last_name: "Reed" }),
      profile({ id: "inactive", first_name: "Gone", active: false }),
    ],
    compensationSettings: [],
    assignments: [assignment("designer", "plan-standard", "2026-01-01")],
    plans: [plan("plan-standard", "sales_designer", "Standard GP")],
    planVersions: [version("v1", "plan-standard")],
    planTiers: [],
    drawPeriods: [drawPeriod("designer", "2026-09-01")],
    settings: SETTINGS,
    today: TODAY,
  });

  assert.deepEqual(
    options.designers.map((designer) => designer.name),
    ["Dana Reed"],
    "only active portal users are offered as sales designers",
  );
  assert.equal(options.designers[0].defaultPlanId, "plan-standard");
  assert.equal(options.designers[0].defaultPlanVersionId, "v1");
  assert.equal(options.designers[0].defaultPlanName, "Standard GP");
  assert.equal(options.designers[0].onDraw, true);
  assert.equal(options.plans.length, 1);
});

test("manager plans are never offered on a job, and never defaulted onto one", () => {
  const options = buildJobEntryOptions({
    profiles: [profile({ id: "manager", first_name: "Mia" })],
    compensationSettings: [],
    assignments: [assignment("manager", "plan-manager", "2026-01-01")],
    plans: [
      plan("plan-manager", "sales_manager", "Manager override"),
      plan("plan-standard", "sales_designer", "Standard GP"),
    ],
    planVersions: [version("v-manager", "plan-manager")],
    planTiers: [],
    drawPeriods: [],
    settings: SETTINGS,
    today: TODAY,
  });

  assert.deepEqual(
    options.plans.map((entry) => entry.id),
    ["plan-standard"],
  );
  assert.equal(options.designers[0].defaultPlanId, null);
  assert.equal(options.designers[0].defaultPlanVersionId, null);
  assert.equal(options.designers[0].onDraw, false);
});

test("an expired or inactive version is not used as the default", () => {
  const options = buildJobEntryOptions({
    profiles: [profile({ id: "designer", first_name: "Dana" })],
    compensationSettings: [],
    assignments: [assignment("designer", "plan-standard", "2026-01-01")],
    plans: [plan("plan-standard", "sales_designer", "Standard GP")],
    planVersions: [
      version("v-old", "plan-standard", { effective_to: "2026-06-30" }),
      version("v-new", "plan-standard", { effective_from: "2026-07-01" }),
      version("v-inactive", "plan-standard", { active: false }),
    ],
    planTiers: [],
    drawPeriods: [],
    settings: SETTINGS,
    today: TODAY,
  });

  assert.equal(options.designers[0].defaultPlanVersionId, "v-new");
});
