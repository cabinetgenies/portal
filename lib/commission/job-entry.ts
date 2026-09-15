import { displayNameFor } from "@/lib/auth/identity";
import { resolveTierForGpPercent, type TierWindow } from "@/lib/compensation/plan-resolution";
import {
  applyDrawRateReduction,
  calculateDepositCommission,
  calculateGrossCommission,
  type CommissionSettingsSnapshot,
} from "@/lib/commission/engine";
import {
  computeJobFinancials,
  jobCostRatesFromRow,
  toNumber,
  ZERO_JOB_COST_RATES,
  type JobCostRateDefaults,
} from "@/lib/commission/financials";
import type { JobFinancialInputs, JobFinancialResults } from "@/lib/commission/types";
import { fromDecimalPercent, toDecimalPercent } from "@/lib/utils/percent";
import type {
  CompensationPlanRow,
  CompensationPlanTierRow,
  CompensationPlanVersionRow,
  EmployeeCompensationAssignmentRow,
  EmployeeCompensationSettingsRow,
  EmployeeDrawPeriodRow,
  JobRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

/**
 * Job entry: the money fields, the live commission preview and the option lists
 * the job form needs.
 *
 * Every figure here comes from the canonical domain functions
 * (`computeJobFinancials`, and the engine's tier/rate/deposit functions). Nothing
 * in this module — or in the form that consumes it — re-implements a formula, so
 * the preview, the stored job row and a commission event can never disagree.
 */

// ---------------------------------------------------------------------------
// Revenue and cost fields (the columns that actually exist on public.jobs)
// ---------------------------------------------------------------------------

export const JOB_REVENUE_FIELDS = [
  {
    name: "contractRevenue",
    column: "contract_revenue",
    label: "Contract revenue",
    hint: "Signed contract value.",
  },
  {
    name: "changeOrderRevenue",
    column: "change_order_revenue",
    label: "Change order revenue",
    hint: "Approved additions to the contract.",
  },
  {
    name: "otherRevenue",
    column: "other_revenue",
    label: "Other revenue",
    hint: "Any other billable revenue.",
  },
  {
    name: "creditAmount",
    column: "credit_amount",
    label: "Credits",
    hint: "Discounts and write-offs. Reduces revenue.",
  },
] as const;

export const JOB_COST_FIELDS = [
  {
    name: "materialCost",
    column: "material_cost",
    label: "Cabinet / material cost",
    hint: "",
  },
  {
    name: "laborCost",
    column: "labor_cost",
    label: "Labor / installation cost",
    hint: "",
  },
  {
    name: "subcontractorCost",
    column: "subcontractor_cost",
    label: "Subcontractor cost",
    hint: "",
  },
  {
    name: "otherDirectCost",
    column: "other_direct_cost",
    label: "Other direct costs",
    hint: "Freight, permits and similar. The schema has no separate freight column.",
  },
] as const;

export const JOB_MONEY_FIELDS = [...JOB_REVENUE_FIELDS, ...JOB_COST_FIELDS] as const;

/**
 * Burden and warranty / service contingency are rates, not amounts. They default
 * from company settings and can be overridden per job; the dollar amounts are
 * derived by the canonical calculation.
 */
export const JOB_COST_RATE_FIELDS = [
  {
    name: "burdenPercent",
    label: "Burden %",
    hint: "Applied to direct job cost, before burden and warranty are added.",
  },
  {
    name: "warrantyContingencyPercent",
    label: "Warranty / service contingency %",
    hint: "Applied to the same direct job cost base as burden.",
  },
] as const;

export type JobCostRateFieldName = (typeof JOB_COST_RATE_FIELDS)[number]["name"];
export type JobCostRateValues = Record<JobCostRateFieldName, string>;

export function emptyJobCostRateValues(): JobCostRateValues {
  return { burdenPercent: "0", warrantyContingencyPercent: "0" };
}

export type JobRevenueFieldName = (typeof JOB_REVENUE_FIELDS)[number]["name"];
export type JobCostFieldName = (typeof JOB_COST_FIELDS)[number]["name"];
export type JobMoneyFieldName = JobRevenueFieldName | JobCostFieldName;

/** Form values are kept as strings so a half-typed number never becomes NaN. */
export type JobMoneyValues = Record<JobMoneyFieldName, string>;

export function emptyJobMoneyValues(): JobMoneyValues {
  return Object.fromEntries(
    JOB_MONEY_FIELDS.map((field) => [field.name, ""]),
  ) as JobMoneyValues;
}

export function jobMoneyValuesFromJob(job: JobRow): JobMoneyValues {
  return Object.fromEntries(
    JOB_MONEY_FIELDS.map((field) => [
      field.name,
      String(toNumber(job[field.column as keyof JobRow] as unknown)),
    ]),
  ) as JobMoneyValues;
}

export function jobFinancialInputsFromValues(
  values: JobMoneyValues,
  rates: JobCostRateDefaults,
): JobFinancialInputs {
  return {
    contractRevenue: toNumber(values.contractRevenue),
    changeOrderRevenue: toNumber(values.changeOrderRevenue),
    creditAmount: toNumber(values.creditAmount),
    otherRevenue: toNumber(values.otherRevenue),
    materialCost: toNumber(values.materialCost),
    laborCost: toNumber(values.laborCost),
    subcontractorCost: toNumber(values.subcontractorCost),
    otherDirectCost: toNumber(values.otherDirectCost),
    burdenPercent: rates.burdenPercent,
    warrantyContingencyPercent: rates.warrantyContingencyPercent,
  };
}

/** Percent points as typed in the form ("10") to decimal shares (0.1). */
export function costRateValuesToDecimals(values: JobCostRateValues): JobCostRateDefaults {
  return {
    burdenPercent: toDecimalPercent(
      Math.max(0, Math.min(100, toNumber(values.burdenPercent))),
    ),
    warrantyContingencyPercent: toDecimalPercent(
      Math.max(0, Math.min(100, toNumber(values.warrantyContingencyPercent))),
    ),
  };
}

/**
 * The rate fields pre-filled for a job: its own snapshot when it has one,
 * otherwise the company default, shown as percent points.
 */
export function jobCostRateValuesFromJob(
  job: Pick<JobRow, "burden_percent" | "warranty_contingency_percent">,
  defaults: JobCostRateDefaults,
): JobCostRateValues {
  const rates = jobCostRatesFromRow(job, defaults);

  return {
    burdenPercent: String(fromDecimalPercent(rates.burdenPercent) ?? 0),
    warrantyContingencyPercent: String(
      fromDecimalPercent(rates.warrantyContingencyPercent) ?? 0,
    ),
  };
}

// ---------------------------------------------------------------------------
// Live preview
// ---------------------------------------------------------------------------

export type JobEntryPreview = {
  financials: JobFinancialResults;
  /** False when the selected plan version has no tiers, so no rate can apply. */
  hasTiers: boolean;
  tierLabel: string | null;
  standardRate: number;
  drawReductionApplied: number;
  effectiveRate: number;
  /** Full commission on commissionable gross profit at the effective rate. */
  projectedGrossCommission: number;
  /** The share payable when the deposit is recorded. */
  depositTarget: number;
  depositPayoutPercent: number;
  warnings: readonly string[];
};

/**
 * The read-only summary the job form shows while it is being filled in.
 *
 * Balances (outstanding draw and rollover) are deliberately not applied here: the
 * entry preview answers "what does this job's structure produce?", while the
 * offsets that decide actual cash are applied when a commission event is created
 * and are shown on the job's Commission section.
 */
export function buildJobEntryPreview({
  values,
  rateValues,
  tiers,
  minimumGpStandard,
  settings,
  onDraw,
}: {
  values: JobMoneyValues;
  rateValues: JobCostRateValues;
  tiers: readonly TierWindow[];
  minimumGpStandard: number;
  settings: CommissionSettingsSnapshot;
  onDraw: boolean;
}): JobEntryPreview {
  // Burden and warranty / service contingency are derived from the rates here by
  // the same canonical function the Server Action persists with.
  const financials = computeJobFinancials(
    jobFinancialInputsFromValues(values, costRateValuesToDecimals(rateValues)),
  );
  const warnings: string[] = [];
  const tier =
    tiers.length > 0
      ? resolveTierForGpPercent(
          tiers,
          financials.commissionableGpPercent,
          minimumGpStandard,
        )
      : null;

  if (tiers.length === 0) {
    warnings.push(
      "Attach a compensation plan version with tiers to see the commission for this job.",
    );
  } else if (!tier) {
    warnings.push(
      "No commission tier matches this commissionable GP percentage, so the standard rate is 0%.",
    );
  }

  const standardRate = tier?.rate ?? 0;
  const drawReductionApplied =
    onDraw && settings.drawEnabled ? Math.max(0, settings.drawRateReduction) : 0;
  const effectiveRate = applyDrawRateReduction(standardRate, drawReductionApplied);
  const projectedGrossCommission = calculateGrossCommission(
    financials.commissionableGrossProfit,
    effectiveRate,
  );
  const depositTarget = calculateDepositCommission(
    projectedGrossCommission,
    settings.depositPayoutPercent,
  );

  return {
    financials,
    hasTiers: tiers.length > 0,
    tierLabel: tier?.label ?? null,
    standardRate,
    drawReductionApplied,
    effectiveRate,
    projectedGrossCommission,
    depositTarget,
    depositPayoutPercent: settings.depositPayoutPercent,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Options for the job form
// ---------------------------------------------------------------------------

export type JobEntryDesigner = {
  id: string;
  name: string;
  email: string | null;
  compensationEligible: boolean;
  /** The assignment in force today, used to default the job's plan. */
  defaultPlanId: string | null;
  defaultPlanVersionId: string | null;
  defaultPlanName: string | null;
  onDraw: boolean;
};

export type JobEntryPlanVersion = {
  id: string;
  versionName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  tiers: TierWindow[];
};

export type JobEntryPlan = {
  id: string;
  name: string;
  active: boolean;
  versions: JobEntryPlanVersion[];
};

export type JobEntryOptions = {
  designers: JobEntryDesigner[];
  plans: JobEntryPlan[];
  settings: CommissionSettingsSnapshot;
  /** Company default burden and warranty rates for a new job. */
  costRates: JobCostRateDefaults;
};

export type JobEntryOptionSources = {
  profiles: readonly ProfileRow[];
  compensationSettings: readonly EmployeeCompensationSettingsRow[];
  assignments: readonly EmployeeCompensationAssignmentRow[];
  plans: readonly CompensationPlanRow[];
  planVersions: readonly CompensationPlanVersionRow[];
  planTiers: readonly CompensationPlanTierRow[];
  drawPeriods: readonly EmployeeDrawPeriodRow[];
  settings: CommissionSettingsSnapshot;
  /** Company default cost rates; defaults to 0% when a caller omits them. */
  costRates?: JobCostRateDefaults;
  today: string;
};

function tierWindowFromRow(row: CompensationPlanTierRow): TierWindow {
  return {
    sortOrder: row.sort_order,
    label: row.label,
    rate: toNumber(row.rate),
    lower: {
      thresholdType: row.lower_threshold_type as TierWindow["lower"]["thresholdType"],
      value: row.lower_gp_percent === null ? null : toNumber(row.lower_gp_percent),
    },
    upper: {
      thresholdType: row.upper_threshold_type as TierWindow["upper"]["thresholdType"],
      value: row.upper_gp_percent === null ? null : toNumber(row.upper_gp_percent),
    },
  };
}

export function isOnDrawOn(
  periods: readonly EmployeeDrawPeriodRow[],
  profileId: string,
  onDate: string,
) {
  return periods.some(
    (period) =>
      period.profile_id === profileId &&
      period.effective_from <= onDate &&
      (period.effective_to === null || period.effective_to >= onDate),
  );
}

function assignmentInForce(
  assignments: readonly EmployeeCompensationAssignmentRow[],
  profileId: string,
  onDate: string,
) {
  return assignments.find((assignment) => {
    if (assignment.profile_id !== profileId) return false;
    if (assignment.effective_from > onDate) return false;
    return assignment.effective_to === null || assignment.effective_to >= onDate;
  });
}

/**
 * Builds the designer list (with each designer's current assignment) and the
 * sales-designer plan catalogue the job form offers.
 *
 * Only `participant_kind = 'sales_designer'` plans are included: a job may never
 * reference a manager plan, and the database rejects one anyway.
 */
export function buildJobEntryOptions({
  profiles,
  compensationSettings,
  assignments,
  plans,
  planVersions,
  planTiers,
  drawPeriods,
  settings,
  costRates = ZERO_JOB_COST_RATES,
  today,
}: JobEntryOptionSources): JobEntryOptions {
  const designerPlans = plans.filter((plan) => plan.participant_kind === "sales_designer");
  const planById = new Map(designerPlans.map((plan) => [plan.id, plan]));

  const designers = profiles
    .filter((profile) => profile.active)
    .map<JobEntryDesigner>((profile) => {
      const assignment = assignmentInForce(assignments, profile.id, today);
      // Only default to an assignment whose plan is still an attachable designer
      // plan; a manager plan must never be pre-filled onto a job.
      const plan = assignment ? planById.get(assignment.compensation_plan_id) : undefined;
      const version =
        plan === undefined
          ? undefined
          : resolveApplicableVersion(planVersions, plan.id, today);

      return {
        id: profile.id,
        name: displayNameFor(profile, profile.email),
        email: profile.email,
        compensationEligible:
          compensationSettings.find((row) => row.profile_id === profile.id)
            ?.compensation_eligible ?? false,
        defaultPlanId: plan?.id ?? null,
        defaultPlanVersionId: version?.id ?? null,
        defaultPlanName: plan?.name ?? null,
        onDraw: isOnDrawOn(drawPeriods, profile.id, today),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    designers,
    plans: designerPlans
      .map<JobEntryPlan>((plan) => ({
        id: plan.id,
        name: plan.name,
        active: plan.active,
        versions: planVersions
          .filter((version) => version.compensation_plan_id === plan.id)
          .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
          .map<JobEntryPlanVersion>((version) => ({
            id: version.id,
            versionName: version.version_name,
            effectiveFrom: version.effective_from,
            effectiveTo: version.effective_to,
            tiers: planTiers
              .filter((tier) => tier.compensation_plan_version_id === version.id)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(tierWindowFromRow),
          })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    settings,
    costRates,
  };
}

function resolveApplicableVersion(
  versions: readonly CompensationPlanVersionRow[],
  planId: string,
  onDate: string,
) {
  return versions
    .filter(
      (version) =>
        version.compensation_plan_id === planId &&
        version.active &&
        version.effective_from <= onDate &&
        (version.effective_to === null || version.effective_to >= onDate),
    )
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
}
