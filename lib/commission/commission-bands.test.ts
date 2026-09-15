import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveApplicablePlanVersion,
  resolveSalePlanSnapshot,
  type PlanVersionWindow,
  type TierWindow,
} from "@/lib/compensation/plan-resolution";
import { bandRangeLabel, bandRateLabel } from "@/lib/compensation/rate-card";
import {
  applyDrawRateReduction,
  calculateStandardCommissionRate,
  type CommissionSettingsSnapshot,
} from "@/lib/commission/engine";
import { buildFinalAuditSnapshot } from "@/lib/commission/audit";
import {
  buildJobEntryLiveCalculation,
  buildJobEntryOptions,
} from "@/lib/commission/job-entry";
import type {
  CompensationPlanRow,
  CompensationPlanVersionRow,
  EmployeeCompensationAssignmentRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

/**
 * Phase 4: the Sales Designer commission bands.
 *
 * These fixtures mirror the rows the migration seeded into
 * `compensation_plan_tiers` for version v2 of the production plan, and the rows v1
 * has carried since the plan was first seeded. The boundary values are the ones the
 * phase specifies.
 */

const SETTINGS: CommissionSettingsSnapshot = {
  depositPayoutPercent: 0.5,
  drawRateReduction: 0.05,
  drawEnabled: true,
};

/** Version 2: 0 / 5 / 10 / 15 / 20 / 25 / 30 percent. */
const V2_TIERS: TierWindow[] = [
  {
    sortOrder: 1,
    label: "49% GP and above",
    rate: 0.3,
    lower: { thresholdType: "fixed", value: 0.49 },
    upper: { thresholdType: "fixed", value: null },
  },
  {
    sortOrder: 2,
    label: "47% to under 49% GP",
    rate: 0.25,
    lower: { thresholdType: "fixed", value: 0.47 },
    upper: { thresholdType: "fixed", value: 0.49 },
  },
  {
    sortOrder: 3,
    label: "45% to under 47% GP",
    rate: 0.2,
    lower: { thresholdType: "fixed", value: 0.45 },
    upper: { thresholdType: "fixed", value: 0.47 },
  },
  {
    sortOrder: 4,
    label: "40% to under 45% GP",
    rate: 0.15,
    lower: { thresholdType: "fixed", value: 0.4 },
    upper: { thresholdType: "fixed", value: 0.45 },
  },
  {
    sortOrder: 5,
    label: "35% to under 40% GP",
    rate: 0.1,
    lower: { thresholdType: "fixed", value: 0.35 },
    upper: { thresholdType: "fixed", value: 0.4 },
  },
  {
    sortOrder: 6,
    label: "30% to under 35% GP",
    rate: 0.05,
    lower: { thresholdType: "fixed", value: 0.3 },
    upper: { thresholdType: "fixed", value: 0.35 },
  },
  {
    sortOrder: 7,
    label: "Below 30% GP (no commission)",
    rate: 0,
    // Open-ended on the lower side: every GP below 30% belongs here, including
    // negative and zero GP.
    lower: { thresholdType: "fixed", value: null },
    upper: { thresholdType: "fixed", value: 0.3 },
  },
];

/** Version 1, unchanged: 0 / 10 / 20 / 30 percent. */
const V1_TIERS: TierWindow[] = [
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

const rateFor = (gpPercent: number, tiers: TierWindow[] = V2_TIERS) =>
  calculateStandardCommissionRate(gpPercent, tiers, 0.36);

const bandFor = (gpPercent: number, tiers: TierWindow[] = V2_TIERS) =>
  tiers.find(
    (tier) =>
      (tier.lower.value === null || gpPercent >= tier.lower.value) &&
      (tier.upper.value === null || gpPercent < tier.upper.value),
  )?.label ?? null;

test("every GP below 30% resolves to the Below 30% band at 0%", () => {
  // Negative GP is a normal outcome, not a gap in the configuration: the bottom band
  // is open-ended, so a loss-making job is auditable like any other.
  assert.equal(bandFor(-0.2), "Below 30% GP (no commission)");
  assert.equal(rateFor(-0.2), 0);
  assert.equal(bandFor(-0.01), "Below 30% GP (no commission)");
  assert.equal(rateFor(-0.01), 0);
  assert.equal(bandFor(0), "Below 30% GP (no commission)");
  assert.equal(rateFor(0), 0);
  assert.equal(bandFor(0.2999), "Below 30% GP (no commission)");
  assert.equal(rateFor(0.2999), 0);
  // ...and the first band above it still earns 5%.
  assert.equal(bandFor(0.3), "30% to under 35% GP");
  assert.equal(rateFor(0.3), 0.05);
});

test("every band boundary resolves to the specified rate", () => {
  assert.equal(rateFor(0.2999), 0, "29.99% GP must earn nothing");
  assert.equal(rateFor(0.3), 0.05);
  assert.equal(rateFor(0.3499), 0.05);
  assert.equal(rateFor(0.35), 0.1);
  assert.equal(rateFor(0.3999), 0.1);
  assert.equal(rateFor(0.4), 0.15);
  assert.equal(rateFor(0.4499), 0.15);
  assert.equal(rateFor(0.45), 0.2);
  assert.equal(rateFor(0.4699), 0.2);
  assert.equal(rateFor(0.47), 0.25);
  assert.equal(rateFor(0.4899), 0.25);
  assert.equal(rateFor(0.49), 0.3);
  assert.equal(rateFor(0.55), 0.3);
});

test("the floor is hard: nothing below 30% GP is smoothed or interpolated", () => {
  // The exact band rates are the only rates that can come out of the resolver.
  const allowed = new Set([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]);

  for (let gp = -0.1; gp <= 0.7; gp += 0.0007) {
    const rate = rateFor(Number(gp.toFixed(6)));

    assert.ok(
      allowed.has(rate),
      `no interpolated rate may appear (GP ${gp} gave ${rate})`,
    );
  }

  // A loss-making job earns nothing — it matches the open-ended bottom band.
  assert.equal(rateFor(-0.05), 0);
  assert.equal(bandFor(-0.05), "Below 30% GP (no commission)");
});

test("draw reduces the rate by points and never below zero", () => {
  const draw = (standardRate: number) => applyDrawRateReduction(standardRate, 0.05);

  assert.equal(draw(0.3), 0.25);
  assert.equal(draw(0.25), 0.2);
  assert.equal(draw(0.2), 0.15);
  assert.equal(draw(0.15), 0.1);
  assert.equal(draw(0.1), 0.05);
  assert.equal(draw(0.05), 0);
  assert.equal(draw(0), 0);

  // It is a subtraction, not a 95% multiple: 0.3 * 0.95 would be 0.285.
  assert.notEqual(draw(0.3), 0.285);
});

test("projected commission and the deposit use the new band rate", () => {
  // 100,000 revenue over 52,200 cost → 47.8% GP → 25% band.
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "52200" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: V2_TIERS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  assert.equal(calculation.commission.commissionableGpPercent, 0.478);
  assert.equal(calculation.commission.tierLabel, "47% to under 49% GP");
  assert.equal(calculation.commission.standardRate, 0.25);
  assert.equal(calculation.commission.drawReduction, 0);
  assert.equal(calculation.commission.effectiveRate, 0.25);
  assert.equal(calculation.commission.projectedGrossCommission, 11950);
  // The deposit stays 50% of projected gross commission.
  assert.equal(calculation.commission.depositTarget, 5975);
});

test("a job under 30% GP projects no commission and no deposit", () => {
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "75000" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: V2_TIERS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  assert.equal(calculation.commission.commissionableGpPercent, 0.25);
  assert.equal(calculation.commission.tierLabel, "Below 30% GP (no commission)");
  assert.equal(calculation.commission.standardRate, 0);
  assert.equal(calculation.commission.projectedGrossCommission, 0);
  assert.equal(calculation.commission.depositTarget, 0);
});

test("the final audit snapshots the new band, rate and true-up", () => {
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "52200" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: V2_TIERS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
    previouslyRecognized: 5000,
  });
  const snapshot = buildFinalAuditSnapshot({ calculation });

  assert.equal(snapshot.finalGpPercent, 0.478);
  assert.equal(snapshot.tierLabel, "47% to under 49% GP");
  assert.equal(snapshot.standardCommissionRate, 0.25);
  assert.equal(snapshot.drawRateReduction, 0);
  assert.equal(snapshot.effectiveCommissionRate, 0.25);
  assert.equal(snapshot.finalGrossCommission, 11950);
  assert.equal(snapshot.previouslyRecognized, 5000);
  assert.equal(snapshot.finalTrueUp, 6950);
});

test("the previous plan version still calculates its own bands", () => {
  // Under v1 the same 47.8% GP job earned 20%, and 50%+ earned 30% on a 50% band.
  assert.equal(rateFor(0.478, V1_TIERS), 0.2);
  assert.equal(rateFor(0.5, V1_TIERS), 0.3);
  assert.equal(rateFor(0.4999, V1_TIERS), 0.2);
  assert.equal(rateFor(0.2999, V1_TIERS), 0, "v1 also paid nothing below 35% GP");
  assert.equal(rateFor(0.34, V1_TIERS), 0);

  // ...and the new bands change what the same job earns today.
  assert.equal(rateFor(0.478, V2_TIERS), 0.25);
  assert.notEqual(rateFor(0.478, V2_TIERS), rateFor(0.478, V1_TIERS));
});

test("an existing commission event keeps the rate it was calculated with", () => {
  // A deposit event created under v1 stored its own band and rate. Introducing v2
  // cannot reach into it: the event is never recomputed from the plan.
  const eventUnderV1 = {
    tierLabel: "45% to under 50% GP",
    standardRate: rateFor(0.478, V1_TIERS),
    effectiveRate: applyDrawRateReduction(rateFor(0.478, V1_TIERS), 0),
    grossCommission: 0.2 * 47800,
  };

  assert.equal(eventUnderV1.standardRate, 0.2);
  assert.equal(eventUnderV1.grossCommission, 9560);

  // The new plan version produces a different figure for the same job — which is
  // exactly why the event keeps its own snapshot.
  const today = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "52200" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: V2_TIERS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  assert.equal(today.commission.projectedGrossCommission, 11950);
  assert.notEqual(today.commission.projectedGrossCommission, eventUnderV1.grossCommission);
});

// ---------------------------------------------------------------------------
// Version defaulting and history
// ---------------------------------------------------------------------------

const V1_WINDOW: PlanVersionWindow = {
  id: "v1",
  commissionPlanId: "plan-standard",
  versionName: "v1",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-09-14",
  active: true,
};

const V2_WINDOW: PlanVersionWindow = {
  id: "v2",
  commissionPlanId: "plan-standard",
  versionName: "v2",
  effectiveFrom: "2026-09-15",
  effectiveTo: null,
  active: true,
};

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

function assignment(profileId: string): EmployeeCompensationAssignmentRow {
  return {
    id: "assignment-1",
    profile_id: profileId,
    compensation_plan_id: "plan-standard",
    effective_from: "2026-01-01",
    effective_to: null,
    notes: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function planVersionRow(
  id: string,
  overrides: Partial<CompensationPlanVersionRow> = {},
): CompensationPlanVersionRow {
  return {
    id,
    compensation_plan_id: "plan-standard",
    version_name: id,
    effective_from: id === "v2" ? "2026-09-15" : "2026-01-01",
    effective_to: id === "v2" ? null : "2026-09-14",
    active: true,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function planRow(): CompensationPlanRow {
  return {
    id: "plan-standard",
    name: "Cabinet Genies Standard GP Commission",
    description: null,
    participant_kind: "sales_designer",
    plan_type: "straight_gp",
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("a new job defaults to the version in force today", () => {
  const options = buildJobEntryOptions({
    profiles: [profile({ id: "designer", first_name: "Dana" })],
    compensationSettings: [],
    assignments: [assignment("designer")],
    plans: [planRow()],
    planVersions: [planVersionRow("v1"), planVersionRow("v2")],
    planTiers: [],
    drawPeriods: [],
    settings: SETTINGS,
    today: "2026-09-15",
  });

  assert.equal(options.designers[0].defaultPlanVersionId, "v2");
});

test("a job that was live before the change keeps the earlier version", () => {
  assert.equal(
    resolveApplicablePlanVersion([V1_WINDOW, V2_WINDOW], "2026-09-14")?.id,
    "v1",
  );
  assert.equal(
    resolveApplicablePlanVersion([V1_WINDOW, V2_WINDOW], "2026-09-15")?.id,
    "v2",
  );
});

test("the version snapshotted for a sale follows the sold date, so history is not reassigned", () => {
  const versions = [V1_WINDOW, V2_WINDOW];

  assert.equal(
    resolveSalePlanSnapshot({ versions, soldDate: "2026-03-01" })?.commissionPlanVersionId,
    "v1",
  );
  assert.equal(
    resolveSalePlanSnapshot({ versions, soldDate: "2026-09-15" })?.commissionPlanVersionId,
    "v2",
  );
});

test("the rate card reads the bands the way an employee would", () => {
  assert.equal(bandRangeLabel(0.3, 0.35), "30–34.99%");
  assert.equal(bandRangeLabel(0.35, 0.4), "35–39.99%");
  assert.equal(bandRangeLabel(0.4, 0.45), "40–44.99%");
  assert.equal(bandRangeLabel(0.45, 0.47), "45–46.99%");
  assert.equal(bandRangeLabel(0.47, 0.49), "47–48.99%");
  assert.equal(bandRangeLabel(0.49, null), "49%+");
  assert.equal(bandRangeLabel(0, 0.3), "Below 30%");
  assert.equal(bandRangeLabel(null, 0.3), "Below 30%");
  assert.equal(bandRateLabel(0.05), "5%");
  assert.equal(bandRateLabel(0.3), "30%");
});

test("the new bands are contiguous: every GP percentage lands in exactly one band", () => {
  const bandOf = (gpPercent: number) =>
    V2_TIERS.find(
      (tier) =>
        (tier.lower.value === null || gpPercent >= tier.lower.value) &&
        (tier.upper.value === null || gpPercent < tier.upper.value),
    );

  // Start below zero: the bottom band is unbounded, so the whole range is covered.
  for (let gp = -0.5; gp <= 0.8; gp += 0.0007) {
    const rounded = Number(gp.toFixed(6));
    const matches = V2_TIERS.filter(
      (tier) =>
        (tier.lower.value === null || rounded >= tier.lower.value) &&
        (tier.upper.value === null || rounded < tier.upper.value),
    );

    assert.equal(matches.length, 1, `GP ${rounded} matched ${matches.length} bands`);
    assert.ok(bandOf(rounded));
  }
});
