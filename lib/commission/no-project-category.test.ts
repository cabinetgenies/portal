import assert from "node:assert/strict";
import test from "node:test";

import type { TierWindow } from "@/lib/compensation/plan-resolution";
import type { CommissionSettingsSnapshot } from "@/lib/commission/engine";
import { calculateStandardCommissionRate } from "@/lib/commission/engine";
import { auditReadiness, buildFinalAuditSnapshot } from "@/lib/commission/audit";
import { buildJobEntryLiveCalculation } from "@/lib/commission/job-entry";
import { jobEntrySchema, jobFinancialsSchema } from "@/lib/commission/validation";

/**
 * Phase 4.1: project categories are gone from the commission system.
 *
 * What these tests pin down: a commission job is created, edited, calculated and
 * audited with no category anywhere, and no category minimum GP can influence a rate.
 */

const SETTINGS: CommissionSettingsSnapshot = {
  depositPayoutPercent: 0.5,
  drawRateReduction: 0.05,
  drawEnabled: true,
};

/** The production v2 bands: fixed percentages only, no category reference. */
const PRODUCTION_BANDS: TierWindow[] = [
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
    // Open-ended below 30%: negative and zero GP belong here too.
    lower: { thresholdType: "fixed", value: null },
    upper: { thresholdType: "fixed", value: 0.3 },
  },
];

const JOB_ID = "22222222-2222-4222-8222-222222222222";

test("a commission job is created without a project category", () => {
  const parsed = jobEntrySchema.safeParse({
    jobName: "Commission Test 50 GP",
    customerName: "Reed",
    status: "sold",
    soldDate: "2026-09-15",
    contractRevenue: "100000",
    originalCost: "50000",
    burdenPercent: "",
    warrantyContingencyPercent: "",
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && "projectCategoryId" in parsed.data, false);
});

test("a legacy payload that still carries a category still saves", () => {
  // The field is simply ignored, so an in-flight form from before the change does
  // not fail validation.
  const parsed = jobEntrySchema.safeParse({
    jobName: "Commission Test 50 GP",
    projectCategoryId: "11111111-1111-4111-8111-111111111111",
    status: "sold",
    soldDate: "2026-09-15",
    contractRevenue: "100000",
    originalCost: "50000",
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && "projectCategoryId" in parsed.data, false);
});

test("a job's financials are edited without a project category", () => {
  const parsed = jobFinancialsSchema.safeParse({
    jobId: JOB_ID,
    contractRevenue: "110000",
    originalCost: "52000",
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && "projectCategoryId" in parsed.data, false);
});

test("commission rate resolution needs no category minimum GP", () => {
  // The same fixed bands, evaluated with a category minimum of 0 (what production
  // passes) and with the old-style minimums, give identical rates: nothing about a
  // category can move a production rate.
  for (const minimumGpStandard of [0, 0.25, 0.36, 0.5, 0.9]) {
    assert.equal(calculateStandardCommissionRate(0.478, PRODUCTION_BANDS, minimumGpStandard), 0.25);
    assert.equal(calculateStandardCommissionRate(0.3, PRODUCTION_BANDS, minimumGpStandard), 0.05);
    assert.equal(calculateStandardCommissionRate(0.2999, PRODUCTION_BANDS, minimumGpStandard), 0);
    assert.equal(calculateStandardCommissionRate(0.55, PRODUCTION_BANDS, minimumGpStandard), 0.3);
  }
});

test("a job with no category projects commission from its GP alone", () => {
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "52200" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: PRODUCTION_BANDS,
    // No category exists, so there is no minimum GP to pass.
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  assert.equal(calculation.commission.commissionableGpPercent, 0.478);
  assert.equal(calculation.commission.standardRate, 0.25);
  assert.equal(calculation.commission.projectedGrossCommission, 11950);
  assert.equal(calculation.commission.depositTarget, 5975);
});

test("the final audit finalizes without a project category", () => {
  const calculation = buildJobEntryLiveCalculation({
    values: { contractRevenue: "100000", originalCost: "50000" },
    rateValues: { burdenPercent: "0", warrantyContingencyPercent: "0" },
    changeOrders: [],
    tiers: PRODUCTION_BANDS,
    minimumGpStandard: 0,
    settings: SETTINGS,
    onDraw: false,
  });

  // Readiness needs a plan version and cost — never a category.
  assert.deepEqual([...auditReadiness({ calculation, hasPlanVersion: true })], []);

  const snapshot = buildFinalAuditSnapshot({ calculation });
  const snapshotKeys = Object.keys(snapshot).map((key) => key.toLowerCase());

  assert.equal(
    snapshotKeys.some((key) => key.includes("categor") || key.includes("minimum_gp")),
    false,
    "the audit snapshot must not carry category data",
  );
  // 50% GP sits in the production plan's top band, which starts at 49%.
  assert.equal(snapshot.tierLabel, "49% GP and above");
  assert.equal(snapshot.finalGpPercent, 0.5);
  assert.equal(snapshot.standardCommissionRate, 0.3);
});

test("commission history still resolves under the version it was calculated with", () => {
  // The previous production version's bands are fixed percentages too, so history
  // keeps working with no category data anywhere.
  const v1Bands: TierWindow[] = [
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
  ];

  assert.equal(calculateStandardCommissionRate(0.5, v1Bands, 0), 0.3);
  assert.equal(calculateStandardCommissionRate(0.47, v1Bands, 0), 0.2);
});
