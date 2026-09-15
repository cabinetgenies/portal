import { z } from "zod";

import {
  ADJUSTMENT_TYPES,
  JOB_STATUSES,
  THRESHOLD_TYPES,
} from "@/lib/commission/types";

/**
 * Shared validation for every commission-domain write.
 *
 * The same schemas run in the browser (for immediate feedback) and inside the
 * Server Actions (as the authoritative check), so the two can never drift.
 *
 * Percentages are exchanged with the UI as percent points (36, 33.5) and stored
 * as decimals (0.36, 0.335) — see `toDecimalPercent`.
 */

export type ActionState =
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    }
  | {
      status: "success";
      message: string;
    }
  | undefined;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toDecimalPercent(percentPoints: number) {
  return Math.round((percentPoints / 100) * 1_000_000) / 1_000_000;
}

export function fromDecimalPercent(decimal: number | null | undefined) {
  if (decimal === null || decimal === undefined) {
    return null;
  }

  return Math.round(decimal * 100 * 1_000_000) / 1_000_000;
}

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

/**
 * Money inputs are blank-by-default in the UI, so an empty string means zero.
 * Negative money is rejected here; job adjustments handle reductions.
 */
const moneyField = (label: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce
      .number()
      .min(0, `${label} cannot be negative.`)
      .max(1_000_000_000, `${label} is larger than this portal supports.`),
  );

const signedMoneyField = (label: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce
      .number()
      .min(-1_000_000_000, `${label} is smaller than this portal supports.`)
      .max(1_000_000_000, `${label} is larger than this portal supports.`),
  );

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
    z
      .string()
      .regex(ISO_DATE, `${label} must be a valid date.`)
      .nullable(),
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

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().trim().min(1).nullable(),
);

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
// Project categories
// ---------------------------------------------------------------------------

export const projectCategorySchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().trim().optional(),
  ),
  name: requiredText("Category name", 80),
  code: requiredText("Category code", 24),
  minimumGpStandardPercent: z.coerce
    .number({ error: "Minimum GP standard must be a number." })
    .min(0, "Minimum GP standard must be between 0% and 100%.")
    .max(100, "Minimum GP standard must be between 0% and 100%."),
  sortOrder: z.coerce
    .number({ error: "Sort order must be a number." })
    .int("Sort order must be a whole number.")
    .min(0, "Sort order cannot be negative.")
    .max(9999, "Sort order is too large."),
  active: booleanField("Active"),
});

export type ProjectCategoryInput = z.infer<typeof projectCategorySchema>;

// ---------------------------------------------------------------------------
// Commission plans, versions and tiers
// ---------------------------------------------------------------------------

export const commissionPlanSchema = z.object({
  id: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().trim().optional(),
  ),
  name: requiredText("Plan name", 120),
  description: optionalText(600),
  planType: z.enum(["straight_gp"], {
    error: "Only straight gross-profit plans are supported today.",
  }),
  active: booleanField("Active"),
});

export type CommissionPlanInput = z.infer<typeof commissionPlanSchema>;

export const commissionPlanVersionSchema = z
  .object({
    commissionPlanId: uuidField("Plan"),
    versionName: requiredText("Version name", 80),
    effectiveFrom: requiredDateField("Effective from"),
    effectiveTo: dateField("Effective to"),
    active: booleanField("Active"),
    notes: optionalText(600),
  })
  .superRefine((value, ctx) => {
    validateDateRange(ctx, value.effectiveFrom, value.effectiveTo);
  });

export type CommissionPlanVersionInput = z.infer<typeof commissionPlanVersionSchema>;

export const commissionTierSchema = z
  .object({
    commissionPlanVersionId: uuidField("Plan version"),
    sortOrder: z.coerce
      .number({ error: "Evaluation order must be a number." })
      .int("Evaluation order must be a whole number.")
      .min(1, "Evaluation order starts at 1.")
      .max(99, "Evaluation order is too large."),
    lowerThresholdType: z.enum(THRESHOLD_TYPES, {
      error: "Choose a lower threshold type.",
    }),
    lowerValue: optionalPercentPoints("Lower bound"),
    upperThresholdType: z.enum(THRESHOLD_TYPES, {
      error: "Choose an upper threshold type.",
    }),
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
      thresholdType: (typeof THRESHOLD_TYPES)[number],
      path: "lowerValue" | "upperValue",
      label: string,
    ) => {
      if (boundValue === null) {
        return;
      }

      if (thresholdType === "fixed" && (boundValue < 0 || boundValue > 100)) {
        addIssue(ctx, path, `${label} must be between 0% and 100% when it is a fixed percentage.`);
      }

      if (thresholdType === "project_minimum" && (boundValue < -50 || boundValue > 50)) {
        addIssue(
          ctx,
          path,
          `${label} must be an offset between -50 and +50 percentage points from the project minimum.`,
        );
      }
    };

    validateBound(value.lowerValue, value.lowerThresholdType, "lowerValue", "Lower bound");
    validateBound(value.upperValue, value.upperThresholdType, "upperValue", "Upper bound");

    if (
      value.lowerThresholdType === "fixed" &&
      value.upperThresholdType === "fixed" &&
      value.lowerValue !== null &&
      value.upperValue !== null &&
      value.lowerValue >= value.upperValue
    ) {
      addIssue(ctx, "upperValue", "The upper bound must be higher than the lower bound.");
    }
  });

export type CommissionTierInput = z.infer<typeof commissionTierSchema>;

// ---------------------------------------------------------------------------
// Employee commission settings and assignments
// ---------------------------------------------------------------------------

export const employeeCommissionSettingsSchema = z.object({
  profileId: uuidField("Employee"),
  commissionEligible: booleanField("Commission eligible"),
  notes: optionalText(400),
});

export const employeeCommissionAssignmentSchema = z
  .object({
    profileId: uuidField("Employee"),
    commissionPlanId: uuidField("Commission plan"),
    effectiveFrom: requiredDateField("Effective from"),
    effectiveTo: dateField("Effective to"),
    notes: optionalText(400),
  })
  .superRefine((value, ctx) => {
    validateDateRange(ctx, value.effectiveFrom, value.effectiveTo);
  });

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobOverviewSchema = z.object({
  jobId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.string().trim().optional(),
  ),
  jobNumber: optionalText(40),
  jobName: requiredText("Job name", 160),
  customerName: optionalText(160),
  projectCategoryId: uuidField("Project category"),
  status: z.enum(JOB_STATUSES, { error: "Choose a job status." }),
  salesDesignerId: optionalUuid,
  soldDate: dateField("Sold date"),
  depositReceivedDate: dateField("Deposit received date"),
  completionDate: dateField("Completion date"),
  gpAuditCompletedDate: dateField("GP audit completed date"),
});

export type JobOverviewInput = z.infer<typeof jobOverviewSchema>;

export const jobFinancialsSchema = z.object({
  jobId: uuidField("Job"),
  contractRevenue: moneyField("Contract revenue"),
  changeOrderRevenue: moneyField("Change order revenue"),
  creditAmount: moneyField("Credit amount"),
  otherRevenue: moneyField("Other revenue"),
  materialCost: moneyField("Material cost"),
  laborCost: moneyField("Labor cost"),
  subcontractorCost: moneyField("Subcontractor cost"),
  otherDirectCost: moneyField("Other direct cost"),
  burdenCost: moneyField("Burden cost"),
  warrantyServiceContingency: moneyField("Warranty/service contingency"),
});

export type JobFinancialsInput = z.infer<typeof jobFinancialsSchema>;

export const jobAdjustmentSchema = z.object({
  jobId: uuidField("Job"),
  adjustmentType: z.enum(ADJUSTMENT_TYPES, { error: "Choose an adjustment type." }),
  amount: signedMoneyField("Amount").refine(
    (value) => Math.round(value * 100) !== 0,
    "Enter a non-zero amount.",
  ),
  reason: requiredText("Reason", 300),
});

export type JobAdjustmentFormInput = z.infer<typeof jobAdjustmentSchema>;

export const jobPlanAssignmentSchema = z.object({
  jobId: uuidField("Job"),
  commissionPlanId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().trim().min(1).nullable(),
  ),
  commissionPlanVersionId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().trim().min(1).nullable(),
  ),
});

export type JobPlanAssignmentInput = z.infer<typeof jobPlanAssignmentSchema>;

// ---------------------------------------------------------------------------
// FormData + result helpers
// ---------------------------------------------------------------------------

/** Reads a FormData payload into a plain object the schemas can consume. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  return values;
}

/** Converts a Zod failure into the shared action state shape. */
export function validationErrorState(error: z.ZodError): ActionState {
  const flattened = z.flattenError(error).fieldErrors as Record<
    string,
    string[] | undefined
  >;
  const fieldErrors: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(flattened)) {
    if (messages && messages.length > 0) {
      fieldErrors[field] = messages;
    }
  }

  const firstMessage =
    Object.values(fieldErrors).flat()[0] ?? "Check the highlighted fields and try again.";

  return { status: "error", message: firstMessage, fieldErrors };
}

export function successState(message: string): ActionState {
  return { status: "success", message };
}

export function failureState(message: string): ActionState {
  return { status: "error", message };
}
