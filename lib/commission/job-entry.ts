import { displayNameFor } from "@/lib/auth/identity";
import type { TierWindow } from "@/lib/compensation/plan-resolution";
import {
  changeOrderTotals,
  type ChangeOrderTotalsInput,
} from "@/lib/commission/change-orders";
import type { CommissionSettingsSnapshot } from "@/lib/commission/engine";
import {
  jobCostRatesFromRow,
  toNumber,
  ZERO_JOB_COST_RATES,
  type JobCostRateDefaults,
} from "@/lib/commission/financials";
import {
  buildLiveCalculation,
  type LiveCalculation,
} from "@/lib/commission/live-calculation";
import type { JobFinancialInputs } from "@/lib/commission/types";
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
import { fromDecimalPercent, toDecimalPercent } from "@/lib/utils/percent";

/**
 * Commission job entry: the original job inputs, the burden and warranty rates,
 * the live calculation, and the option lists the job form needs.
 *
 * The financial model is deliberately small — original contract price, original
 * costs, and change orders — and every derived figure comes from the canonical
 * functions (`computeJobFinancials` via `buildLiveCalculation`, and the commission
 * engine). Nothing in this module or the forms that use it re-implements a formula.
 */

// ---------------------------------------------------------------------------
// Original job inputs
// ---------------------------------------------------------------------------

export const JOB_ORIGINAL_FIELDS = [
  {
    name: "contractRevenue",
    column: "contract_revenue",
    label: "Original contract price",
    hint: "The signed contract, before change orders.",
  },
  {
    name: "originalCost",
    column: "original_cost",
    label: "Original costs",
    hint: "Total original job cost, before change orders, burden and warranty contingency.",
  },
] as const;

export const JOB_MONEY_FIELDS = JOB_ORIGINAL_FIELDS;

export type JobMoneyFieldName = (typeof JOB_ORIGINAL_FIELDS)[number]["name"];

/** Form values are kept as strings so a half-typed number never becomes NaN. */
export type JobMoneyValues = Record<JobMoneyFieldName, string>;

export function emptyJobMoneyValues(): JobMoneyValues {
  return { contractRevenue: "", originalCost: "" };
}

export function jobMoneyValuesFromJob(job: JobRow): JobMoneyValues {
  return {
    contractRevenue: String(toNumber(job.contract_revenue)),
    originalCost: String(toNumber(job.original_cost)),
  };
}

// ---------------------------------------------------------------------------
// Burden and warranty rates
// ---------------------------------------------------------------------------

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
// Inputs and the live calculation
// ---------------------------------------------------------------------------

/**
 * The canonical inputs for a job being edited in a form.
 *
 * Change order revenue and cost are the *roll-up of the change order rows*; the
 * job's stored totals are never passed in, so the aggregate can only be produced
 * in one place. `otherRevenue` and `creditAmount` are carried through from the
 * stored job row because they are no longer editable inputs.
 */
export function jobFinancialInputsFromValues(
  values: JobMoneyValues,
  rates: JobCostRateDefaults,
  extras: {
    changeOrders?: readonly ChangeOrderTotalsInput[];
    otherRevenue?: number;
    creditAmount?: number;
  } = {},
): JobFinancialInputs {
  const totals = changeOrderTotals(extras.changeOrders ?? []);

  return {
    contractRevenue: toNumber(values.contractRevenue),
    changeOrderRevenue: totals.revenue,
    creditAmount: toNumber(extras.creditAmount),
    otherRevenue: toNumber(extras.otherRevenue),
    originalCost: toNumber(values.originalCost),
    changeOrderCost: totals.cost,
    burdenPercent: rates.burdenPercent,
    warrantyContingencyPercent: rates.warrantyContingencyPercent,
  };
}

/** The live calculation for job-entry form state. */
export function buildJobEntryLiveCalculation({
  values,
  rateValues,
  changeOrders,
  tiers,
  minimumGpStandard,
  settings,
  onDraw,
  previouslyRecognized = 0,
  otherRevenue = 0,
  creditAmount = 0,
}: {
  values: JobMoneyValues;
  rateValues: JobCostRateValues;
  changeOrders: readonly ChangeOrderTotalsInput[];
  tiers: readonly TierWindow[];
  minimumGpStandard: number;
  settings: CommissionSettingsSnapshot;
  onDraw: boolean;
  previouslyRecognized?: number;
  otherRevenue?: number;
  creditAmount?: number;
}): LiveCalculation {
  return buildLiveCalculation({
    inputs: jobFinancialInputsFromValues(
      values,
      costRateValuesToDecimals(rateValues),
      { changeOrders, otherRevenue, creditAmount },
    ),
    tiers,
    minimumGpStandard,
    settings,
    onDraw,
    previouslyRecognized,
  });
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

/** Plan tiers as the engine's pure windows, with numeric columns coerced. */
export function tierWindowsFromRows(
  rows: readonly CompensationPlanTierRow[],
): TierWindow[] {
  return rows
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(tierWindowFromRow);
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
