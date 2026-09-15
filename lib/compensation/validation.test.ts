import assert from "node:assert/strict";
import test from "node:test";

import {
  compensationPlanSchema,
  compensationPlanVersionSchema,
  compensationTierSchema,
} from "@/lib/compensation/validation";

const plan = (overrides: Record<string, unknown> = {}) => ({
  name: "Straight GP",
  description: "",
  participantKind: "sales_designer",
  planType: "straight_gp",
  active: "on",
  ...overrides,
});

const tier = (overrides: Record<string, unknown> = {}) => ({
  compensationPlanVersionId: "44444444-4444-4444-8444-444444444444",
  sortOrder: "1",
  lowerThresholdType: "fixed",
  lowerValue: "25",
  upperThresholdType: "fixed",
  upperValue: "40",
  ratePercent: "28",
  label: "25% to under 40%",
  ...overrides,
});

test("a plan can be configured for either participant kind", () => {
  assert.equal(compensationPlanSchema.safeParse(plan()).success, true);
  assert.equal(
    compensationPlanSchema.safeParse(plan({ participantKind: "sales_manager" })).success,
    true,
  );
});

test("an unknown participant kind or plan type is rejected", () => {
  assert.equal(
    compensationPlanSchema.safeParse(plan({ participantKind: "split_commission" })).success,
    false,
  );
  assert.equal(
    compensationPlanSchema.safeParse(plan({ planType: "designer_split" })).success,
    false,
  );
});

test("a plan name is required", () => {
  assert.equal(compensationPlanSchema.safeParse(plan({ name: "   " })).success, false);
});

test("tier rates and fixed bounds are validated as percentages", () => {
  assert.equal(compensationTierSchema.safeParse(tier()).success, true);
  assert.equal(compensationTierSchema.safeParse(tier({ ratePercent: "120" })).success, false);
  assert.equal(compensationTierSchema.safeParse(tier({ lowerValue: "-5" })).success, false);
});

test("category-relative band bounds can no longer be created", () => {
  // Project categories were removed from the commission system, so a new tier must
  // use fixed GP percentages. Tiers that already carry project_minimum still resolve.
  assert.equal(
    compensationTierSchema.safeParse(
      tier({ upperThresholdType: "project_minimum", upperValue: "0" }),
    ).success,
    false,
  );
  assert.equal(
    compensationTierSchema.safeParse(
      tier({ lowerThresholdType: "project_minimum", lowerValue: "-5" }),
    ).success,
    false,
  );
});

test("fixed bounds must be ordered", () => {
  assert.equal(
    compensationTierSchema.safeParse(tier({ lowerValue: "40", upperValue: "25" })).success,
    false,
  );
});

test("an open-ended band is allowed on either end", () => {
  assert.equal(
    compensationTierSchema.safeParse(tier({ lowerValue: "", upperValue: "" })).success,
    true,
  );
});

test("an effective date range cannot run backwards", () => {
  const version = {
    compensationPlanId: "33333333-3333-4333-8333-333333333333",
    versionName: "v2",
    effectiveFrom: "2026-07-01",
    effectiveTo: "2026-06-30",
    active: "on",
    notes: "",
  };

  assert.equal(compensationPlanVersionSchema.safeParse(version).success, false);
  assert.equal(
    compensationPlanVersionSchema.safeParse({ ...version, effectiveTo: "2026-12-31" }).success,
    true,
  );
});
