import { z } from "zod";

import { ADJUSTMENT_TYPES, JOB_STATUSES } from "@/lib/commission/types";

/**
 * Validation for job writes.
 *
 * Compensation rules live in lib/compensation/validation.ts; a job only records
 * which version of which plan governs its sales designer.
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

/**
 * A cost rate entered as percent points (10 = 10%) and stored as a decimal share.
 *
 * Blank is meaningful: it means "use the company default", which the Server Action
 * resolves before the canonical calculation runs. Negative and above-100% values
 * are data-entry errors, rejected here as well as by the database constraints.
 */
const optionalPercentPoints = (label: string) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.coerce
      .number({ error: `${label} must be a number.` })
      .min(0, `${label} cannot be negative.`)
      .max(100, `${label} cannot be more than 100%.`)
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

const uuidField = (label: string) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`);

const optionalUuid = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.string().trim().min(1).nullable(),
);

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
  burdenPercent: optionalPercentPoints("Burden percentage"),
  warrantyContingencyPercent: optionalPercentPoints("Warranty contingency percentage"),
});

export type JobFinancialsInput = z.infer<typeof jobFinancialsSchema>;

/**
 * The complete job entry payload used by the New job form: identity, milestone
 * dates, the compensation plan version and the revenue/cost inputs, so a job is
 * created in one pass instead of being saved empty and filled in later.
 *
 * The plan fields are optional on purpose: a job may be created before its sales
 * designer has a plan assignment, and the version can be attached afterwards.
 */
export const jobEntrySchema = jobOverviewSchema.omit({ jobId: true }).extend({
  compensationPlanId: optionalUuid,
  compensationPlanVersionId: optionalUuid,
  contractRevenue: moneyField("Contract revenue"),
  changeOrderRevenue: moneyField("Change order revenue"),
  creditAmount: moneyField("Credits"),
  otherRevenue: moneyField("Other revenue"),
  materialCost: moneyField("Material cost"),
  laborCost: moneyField("Labor cost"),
  subcontractorCost: moneyField("Subcontractor cost"),
  otherDirectCost: moneyField("Other direct cost"),
  burdenPercent: optionalPercentPoints("Burden percentage"),
  warrantyContingencyPercent: optionalPercentPoints("Warranty contingency percentage"),
});

export type JobEntryInput = z.infer<typeof jobEntrySchema>;

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

/**
 * Attaching rules to a job.
 *
 * `compensationPlanId` is always a *sales designer* plan: the database rejects a
 * job that references a manager plan, because manager compensation is attributed
 * to qualifying jobs separately and is never a share of the designer's payout.
 */
export const jobCompensationPlanSchema = z.object({
  jobId: uuidField("Job"),
  compensationPlanId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().trim().min(1).nullable(),
  ),
  compensationPlanVersionId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.string().trim().min(1).nullable(),
  ),
});

export type JobCompensationPlanInput = z.infer<typeof jobCompensationPlanSchema>;

// ---------------------------------------------------------------------------
// Draw against commission and ledger adjustments
// ---------------------------------------------------------------------------

/** Placing an employee on draw, or closing an existing draw period. */
export const drawPeriodSchema = z
  .object({
    profileId: uuidField("Employee"),
    effectiveFrom: requiredDateField("Effective from"),
    effectiveTo: dateField("Effective to"),
    notes: optionalText(400),
  })
  .superRefine((value, ctx) => {
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        message: "The end date cannot be before the start date.",
        path: ["effectiveTo"],
      });
    }
  });

export const endDrawPeriodSchema = z.object({
  profileId: uuidField("Employee"),
  effectiveTo: requiredDateField("Effective to"),
  notes: optionalText(400),
});

/** A draw advance increases the outstanding draw; the amount is always positive. */
export const drawAdvanceSchema = z.object({
  profileId: uuidField("Employee"),
  amount: moneyField("Draw advance").refine(
    (value) => Math.round(value * 100) > 0,
    "Enter a draw advance amount greater than zero.",
  ),
  reason: requiredText("Reason", 300),
  jobId: optionalUuid,
});

/** Documented manual adjustments may be positive or negative but never zero. */
export const ledgerAdjustmentSchema = z.object({
  profileId: uuidField("Employee"),
  amount: signedMoneyField("Amount").refine(
    (value) => Math.round(value * 100) !== 0,
    "Enter a non-zero amount.",
  ),
  reason: requiredText("Reason", 300),
});
