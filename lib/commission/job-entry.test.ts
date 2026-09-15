import assert from "node:assert/strict";
import test from "node:test";

import type { TierWindow } from "@/lib/compensation/plan-resolution";
import type { CommissionSettingsSnapshot } from "@/lib/commission/engine";
import {
  buildJobEntryOptions,
  buildJobEntryPreview,
  emptyJobMoneyValues,
  jobFinancialInputsFromValues,
  jobMoneyValuesFromJob,
  type JobMoneyValues,
} from "@/lib/commission/job-entry";
import type {
  CompensationPlanRow,
  CompensationPlanTierRow,
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

function values(overrides: Partial<JobMoneyValues> = {}): JobMoneyValues {
  return { ...emptyJobMoneyValues(), ...overrides };
}

function preview(
  money: Partial<JobMoneyValues>,
  options: { tiers?: TierWindow[]; onDraw?: boolean; settings?: CommissionSettingsSnapshot } = {},
) {
  return buildJobEntryPreview({
    values: values(money),
    tiers: options.tiers ?? PRODUCTION_TIERS,
    minimumGpStandard: 0.35,
    settings: options.settings ?? SETTINGS,
    onDraw: options.onDraw ?? false,
  });
}

test("the documented 50 GP test case produces 30% and a $7,500 deposit target", () => {
  const result = preview({ contractRevenue: "100000", materialCost: "50000" });

  assert.equal(result.financials.actualTotalRevenue, 100000);
  assert.equal(result.financials.actualTotalCost, 50000);
  assert.equal(result.financials.jobGrossProfit, 50000);
  assert.equal(result.financials.jobGpPercent, 0.5);
  assert.equal(result.financials.commissionableGrossProfit, 50000);
  assert.equal(result.financials.commissionableGpPercent, 0.5);
  assert.equal(result.tierLabel, "50% GP and above");
  assert.equal(result.standardRate, 0.3);
  assert.equal(result.drawReductionApplied, 0);
  assert.equal(result.effectiveRate, 0.3);
  assert.equal(result.projectedGrossCommission, 15000);
  assert.equal(result.depositTarget, 7500);
  assert.deepEqual([...result.warnings], []);
});

test("burden is part of total job cost, so the same GP band is reached from the cost lines", () => {
  const result = preview({
    contractRevenue: "100000",
    materialCost: "30000",
    laborCost: "10000",
    subcontractorCost: "5000",
    otherDirectCost: "1000",
    burdenCost: "3000",
    warrantyServiceContingency: "1000",
  });

  assert.equal(result.financials.actualTotalCost, 50000);
  assert.equal(result.financials.jobGrossProfit, 50000);
  assert.equal(result.standardRate, 0.3);
  assert.equal(result.projectedGrossCommission, 15000);
});

test("band boundaries resolve to the tier the engine would use", () => {
  // Exactly 50% falls in the top band; just under it drops to 20%.
  assert.equal(preview({ contractRevenue: "100000", materialCost: "50000" }).standardRate, 0.3);
  assert.equal(
    preview({ contractRevenue: "100000", materialCost: "50001" }).standardRate,
    0.2,
    "49.999% must not fall into the 50% band",
  );

  // Exactly 45% falls in the 20% band; just under it drops to 10%.
  assert.equal(preview({ contractRevenue: "100000", materialCost: "55000" }).standardRate, 0.2);
  assert.equal(preview({ contractRevenue: "100000", materialCost: "55010" }).standardRate, 0.1);

  // Exactly 35% still earns 10%; below it the rate is 0%.
  assert.equal(preview({ contractRevenue: "100000", materialCost: "65000" }).standardRate, 0.1);
  assert.equal(preview({ contractRevenue: "100000", materialCost: "65010" }).standardRate, 0);
});

test("credits reduce revenue before the tier is resolved", () => {
  const result = preview({
    contractRevenue: "100000",
    creditAmount: "10000",
    materialCost: "50000",
  });

  assert.equal(result.financials.actualTotalRevenue, 90000);
  assert.equal(result.financials.jobGrossProfit, 40000);
  assert.equal(result.tierLabel, "35% to under 45% GP");
  assert.equal(result.projectedGrossCommission, 4000);
  assert.equal(result.depositTarget, 2000);
});

test("draw lowers the rate by points, never by a multiple", () => {
  const onDraw = preview(
    { contractRevenue: "100000", materialCost: "50000" },
    { onDraw: true },
  );

  assert.equal(onDraw.standardRate, 0.3);
  assert.equal(onDraw.drawReductionApplied, 0.05);
  assert.equal(onDraw.effectiveRate, 0.25);
  assert.equal(onDraw.projectedGrossCommission, 12500);
  assert.equal(onDraw.depositTarget, 6250);

  const drawDisabled = preview(
    { contractRevenue: "100000", materialCost: "50000" },
    {
      onDraw: true,
      settings: { ...SETTINGS, drawEnabled: false },
    },
  );

  assert.equal(drawDisabled.drawReductionApplied, 0);
  assert.equal(drawDisabled.effectiveRate, 0.3);
});

test("a job without tiers still totals correctly and says why there is no commission", () => {
  const result = preview({ contractRevenue: "100000", materialCost: "50000" }, { tiers: [] });

  assert.equal(result.hasTiers, false);
  assert.equal(result.financials.commissionableGrossProfit, 50000);
  assert.equal(result.standardRate, 0);
  assert.equal(result.projectedGrossCommission, 0);
  assert.equal(result.depositTarget, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(String(result.warnings[0]), /compensation plan version/i);
});

test("money values round-trip from a stored job back into the preview inputs", () => {
  const job = {
    contract_revenue: "100000.00",
    change_order_revenue: "0.00",
    credit_amount: "0.00",
    other_revenue: "0.00",
    material_cost: "50000.00",
    labor_cost: "0.00",
    subcontractor_cost: "0.00",
    other_direct_cost: "0.00",
    burden_cost: "0.00",
    warranty_service_contingency: "0.00",
  } as unknown as JobRow;

  const roundTripped = preview(jobMoneyValuesFromJob(job));

  assert.equal(roundTripped.projectedGrossCommission, 15000);
  assert.equal(jobFinancialInputsFromValues(jobMoneyValuesFromJob(job)).contractRevenue, 100000);
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

function tier(
  id: string,
  versionId: string,
  rate: number,
  sortOrder: number,
): CompensationPlanTierRow {
  return {
    id,
    compensation_plan_version_id: versionId,
    sort_order: sortOrder,
    lower_gp_percent: sortOrder === 1 ? 0.5 : null,
    lower_threshold_type: "fixed",
    upper_gp_percent: sortOrder === 1 ? null : 0.5,
    upper_threshold_type: "fixed",
    rate,
    label: `band ${sortOrder}`,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
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
    planTiers: [tier("t1", "v1", 0.3, 1)],
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
  assert.equal(options.plans[0].versions[0].tiers.length, 1);
  assert.equal(options.plans[0].versions[0].tiers[0].rate, 0.3);
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
