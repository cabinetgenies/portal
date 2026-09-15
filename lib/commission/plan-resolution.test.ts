import assert from "node:assert/strict";
import test from "node:test";

import {
  isVersionEffectiveOn,
  resolveApplicablePlanVersion,
  resolveSalePlanSnapshot,
  resolveTierBound,
  resolveTierForGpPercent,
  tierContainsGpPercent,
  type PlanVersionWindow,
  type TierWindow,
} from "@/lib/commission/plan-resolution";

const version = (
  overrides: Partial<PlanVersionWindow> & { id: string },
): PlanVersionWindow => ({
  commissionPlanId: "plan-1",
  versionName: "v1",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  active: true,
  ...overrides,
});

test("effective windows are inclusive on both ends", () => {
  const window = version({
    id: "a",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-06-30",
  });

  assert.equal(isVersionEffectiveOn(window, "2025-12-31"), false);
  assert.equal(isVersionEffectiveOn(window, "2026-01-01"), true);
  assert.equal(isVersionEffectiveOn(window, "2026-06-30"), true);
  assert.equal(isVersionEffectiveOn(window, "2026-07-01"), false);
});

test("plan resolution returns the version effective on the requested date", () => {
  const versions = [
    version({ id: "v1", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" }),
    version({
      id: "v2",
      versionName: "v2",
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
    }),
  ];

  assert.equal(resolveApplicablePlanVersion(versions, "2026-03-15")?.id, "v1");
  assert.equal(resolveApplicablePlanVersion(versions, "2026-09-01")?.id, "v2");
  assert.equal(resolveApplicablePlanVersion(versions, "2025-01-01"), null);
});

test("inactive versions are never selected", () => {
  const versions = [version({ id: "v1", active: false })];

  assert.equal(resolveApplicablePlanVersion(versions, "2026-03-15"), null);
});

test("the sale snapshot keeps the plan version that was in force on the sold date", () => {
  const versions = [
    version({ id: "v1", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" }),
    version({
      id: "v2",
      versionName: "v2",
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
    }),
  ];

  assert.deepEqual(
    resolveSalePlanSnapshot({ versions, soldDate: "2026-02-20" }),
    { commissionPlanId: "plan-1", commissionPlanVersionId: "v1" },
  );

  // A job sold under v1 keeps v1 even after v2 exists.
  assert.equal(
    resolveSalePlanSnapshot({ versions, soldDate: "2026-02-20" })
      ?.commissionPlanVersionId,
    "v1",
  );
});

test("no snapshot is produced without a sold date or without a matching version", () => {
  const versions = [version({ id: "v1", effectiveFrom: "2026-01-01" })];

  assert.equal(resolveSalePlanSnapshot({ versions, soldDate: null }), null);
  assert.equal(
    resolveSalePlanSnapshot({ versions, soldDate: "2025-05-05" }),
    null,
  );
});

test("a fixed tier bound is an absolute GP percentage", () => {
  assert.equal(
    resolveTierBound({ thresholdType: "fixed", value: 0.25 }, 0.36),
    0.25,
  );
  assert.equal(resolveTierBound({ thresholdType: "fixed", value: null }, 0.36), null);
});

test("a project_minimum tier bound is an offset from the category minimum", () => {
  assert.equal(
    resolveTierBound({ thresholdType: "project_minimum", value: null }, 0.36),
    0.36,
  );
  assert.equal(
    resolveTierBound({ thresholdType: "project_minimum", value: 0 }, 0.4),
    0.4,
  );
  assert.equal(
    resolveTierBound({ thresholdType: "project_minimum", value: 0.02 }, 0.36),
    0.38,
  );
});

const senSampleTiers: TierWindow[] = [
  {
    sortOrder: 1,
    label: "At or above the project minimum GP standard",
    rate: 0.33,
    lower: { thresholdType: "project_minimum", value: 0 },
    upper: { thresholdType: "fixed", value: null },
  },
  {
    sortOrder: 2,
    label: "25% up to the project minimum",
    rate: 0.28,
    lower: { thresholdType: "fixed", value: 0.25 },
    upper: { thresholdType: "project_minimum", value: 0 },
  },
  {
    sortOrder: 3,
    label: "15% to under 25%",
    rate: 0.1,
    lower: { thresholdType: "fixed", value: 0.15 },
    upper: { thresholdType: "fixed", value: 0.25 },
  },
  {
    sortOrder: 4,
    label: "Under 15%",
    rate: 0,
    lower: { thresholdType: "fixed", value: null },
    upper: { thresholdType: "fixed", value: 0.15 },
  },
];

test("tier bands resolve against each category's own minimum GP standard", () => {
  // A kitchen at a 36% minimum standard.
  assert.equal(resolveTierForGpPercent(senSampleTiers, 0.4, 0.36)?.rate, 0.33);
  assert.equal(resolveTierForGpPercent(senSampleTiers, 0.3, 0.36)?.rate, 0.28);
  assert.equal(resolveTierForGpPercent(senSampleTiers, 0.2, 0.36)?.rate, 0.1);
  assert.equal(resolveTierForGpPercent(senSampleTiers, 0.1, 0.36)?.rate, 0);

  // The same percentages against a category with a 30% minimum standard.
  assert.equal(resolveTierForGpPercent(senSampleTiers, 0.32, 0.3)?.rate, 0.33);
  assert.equal(resolveTierForGpPercent(senSampleTiers, 0.27, 0.3)?.rate, 0.28);
});

test("tier membership is exclusive on the upper bound and inclusive on the lower bound", () => {
  const band = senSampleTiers[2];

  assert.equal(tierContainsGpPercent(band, 0.15, 0.36), true);
  assert.equal(tierContainsGpPercent(band, 0.2499, 0.36), true);
  assert.equal(tierContainsGpPercent(band, 0.25, 0.36), false);
  assert.equal(tierContainsGpPercent(band, 0.1499, 0.36), false);
});
