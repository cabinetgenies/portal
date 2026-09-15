import { z } from "zod";

import {
  COMPENSATION_PLAN_TYPES,
  PARTICIPANT_KINDS,
} from "@/lib/compensation/types";

/**
 * Validation for compensation configuration: plans, effective-dated versions,
 * tiers, employee eligibility and plan assignments.
 *
 * Percentages are exchanged with the UI as percent points (36, 33.5) and stored
 * as decimals (0.36, 0.335) — see `toDecimalPercent`.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

const optionalPercentPoints = (label: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.coerce
      .number()
      .min(-100, `${label} must be between -100% and 100%.`)
      .max(100, `${label} must be between -100% and 100%.`)
      .nullable(),
  );

const dateField = (label: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().regex(ISO_DATE, `${label} must be a valid date.`).nullable(),
  );

const requiredDateField = (label: string) =>
  z
    .string({ error: `${label} is required.` })
    .regex(ISO_DATE, `${label} must be a valid date.`);

const booleanField = (label: string) =>
  z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (value === null || value === undefined || value === "") return false;
    const normalized = String(value).toLowerCase();
    return normalized === "on" || normalized === "true" || normalized === "1";
  }, z.boolean({ error: `${label} must be true or false.` }));

const uuidField = (label: string) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`);

function addIssue(ctx: z.RefinementCtx, path: string, message: string) {
  ctx.addIssue({ code: "custom", message, path: [path] });
}

function validateDateRange(
  ctx: z.RefinementCtx,
  from: string | null,
  to: string | null,
  fromPath = "effectiveFrom",
  toPath = "effectiveTo",
) {
  if (from && to && to < from) {
    addIssue(ctx, toPath, "The end date cannot be before the start date.");
  }

  if (!from && to) {
    addIssue(ctx, fromPath, "A start date is required when an end date is set.");
  }
}

// ---------------------------------------------------------------------------
// Compensation plans, versions and tiers
// ---------------------------------------------------------------------------

/**
 * Commission engine settings. Values are entered as percent points (50 for 50%,
 * 5 for five percentage points) and stored as decimals.
 */
export const commissionSettingsSchema = z.object({
  effectiveFrom: requiredDateField("Effective from"),
  depositPayoutPercent: z.coerce
    .number({ error: "Deposit payout must be a number." })
    .min(0, "Deposit payout must be between 0% and 100%.")
    .max(100, "Deposit payout must be between 0% and 100%."),
  drawRateReduction: z.coerce
    .number({ error: "Draw rate reduction must be a number." })
    .min(0, "Draw rate reduction must be between 0 and 100 percentage points.")
    .max(100, "Draw rate reduction must be between 0 and 100 percentage points."),
  burdenPercent: z.coerce
    .number({ error: "Burden percentage must be a number." })
    .min(0, "Burden percentage cannot be negative.")
    .max(100, "Burden percentage cannot be more than 100%."),
  warrantyContingencyPercent: z.coerce
    .number({ error: "Warranty contingency percentage must be a number." })
    .min(0, "Warranty contingency percentage cannot be negative.")
    .max(100, "Warranty contingency percentage cannot be more than 100%."),
  drawEnabled: booleanField("Draw system enabled"),
  notes: optionalText(400),
});

export type CommissionSettingsInput = z.infer<typeof commissionSettingsSchema>;

export const compensationPlanSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().trim().optional(),
  ),
  name: requiredText("Plan name", 120),
  description: optionalText(600),
  participantKind: z.enum(PARTICIPANT_KINDS, {
    error: "Choose who this plan compensates.",
  }),
  planType: z.enum(COMPENSATION_PLAN_TYPES, {
    error: "Only straight gross-profit plans are supported today.",
  }),
  active: booleanField("Active"),
});

export type CompensationPlanInput = z.infer<typeof compensationPlanSchema>;

export const compensationPlanVersionSchema = z
  .object({
    compensationPlanId: uuidField("Plan"),
    versionName: requiredText("Version name", 80),
    effectiveFrom: requiredDateField("Effective from"),
    effectiveTo: dateField("Effective to"),
    active: booleanField("Active"),
    notes: optionalText(600),
  })
  .superRefine((value, ctx) => {
    validateDateRange(ctx, value.effectiveFrom, value.effectiveTo);
  });

export type CompensationPlanVersionInput = z.infer<
  typeof compensationPlanVersionSchema
>;

/**
 * Band bounds are fixed GP percentages.
 *
 * `project_minimum` (a bound expressed as an offset from a project category's
 * minimum GP standard) is no longer offerable: project categories were removed from
 * the commission system in Phase 4.1. Historical tiers that already carry the type
 * still load and resolve — `resolveTierBound` keeps that support — but no new
 * category-relative band can be created.
 */
const fixedThresholdField = z.enum(["fixed"] as const, {
  error:
    "Bands use fixed GP percentages. Category-relative thresholds were removed with project categories.",
});

export const compensationTierSchema = z
  .object({
    compensationPlanVersionId: uuidField("Plan version"),
    sortOrder: z.coerce
      .number({ error: "Evaluation order must be a number." })
      .int("Evaluation order must be a whole number.")
      .min(1, "Evaluation order starts at 1.")
      .max(99, "Evaluation order is too large."),
    lowerThresholdType: fixedThresholdField,
    lowerValue: optionalPercentPoints("Lower bound"),
    upperThresholdType: fixedThresholdField,
    upperValue: optionalPercentPoints("Upper bound"),
    ratePercent: z.coerce
      .number({ error: "Rate must be a number." })
      .min(0, "Rate must be between 0% and 100%.")
      .max(100, "Rate must be between 0% and 100%."),
    label: optionalText(120),
  })
  .superRefine((value, ctx) => {
    const validateBound = (
      boundValue: number | null,
      path: "lowerValue" | "upperValue",
      label: string,
    ) => {
      if (boundValue === null) {
        return;
      }

      if (boundValue < 0 || boundValue > 100) {
        addIssue(ctx, path, `${label} must be between 0% and 100% when it is a fixed percentage.`);
      }
    };

    validateBound(value.lowerValue, "lowerValue", "Lower bound");
    validateBound(value.upperValue, "upperValue", "Upper bound");

    if (
      value.lowerValue !== null &&
      value.upperValue !== null &&
      value.lowerValue >= value.upperValue
    ) {
      addIssue(ctx, "upperValue", "The upper bound must be higher than the lower bound.");
    }
  });

export type CompensationTierInput = z.infer<typeof compensationTierSchema>;

// ---------------------------------------------------------------------------
// Employee eligibility and dated plan assignments
// ---------------------------------------------------------------------------

export const employeeCompensationSettingsSchema = z.object({
  profileId: uuidField("Employee"),
  compensationEligible: booleanField("Compensation eligible"),
  notes: optionalText(400),
});

export const employeeCompensationAssignmentSchema = z
  .object({
    profileId: uuidField("Employee"),
    compensationPlanId: uuidField("Compensation plan"),
    effectiveFrom: requiredDateField("Effective from"),
    effectiveTo: dateField("Effective to"),
    notes: optionalText(400),
  })
  .superRefine((value, ctx) => {
    validateDateRange(ctx, value.effectiveFrom, value.effectiveTo);
  });
