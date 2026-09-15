import { roundPercent } from "@/lib/commission/financials";
import type { ThresholdType } from "@/lib/commission/types";

/**
 * Effective-dated plan resolution.
 *
 * A job keeps the plan *version* that governed it when it was sold. The rule for
 * choosing that version lives here, so a future "mark job sold" action can
 * snapshot it without re-deriving anything later.
 */

export type PlanVersionWindow = {
  id: string;
  commissionPlanId: string;
  versionName: string;
  /** Inclusive start date, ISO `YYYY-MM-DD`. */
  effectiveFrom: string;
  /** Inclusive end date, or null for open-ended. */
  effectiveTo: string | null;
  active: boolean;
};

export type PlanSnapshot = {
  commissionPlanId: string;
  commissionPlanVersionId: string;
};

/** ISO dates compare correctly as strings, which keeps this logic date-library free. */
export function isVersionEffectiveOn(version: PlanVersionWindow, onDate: string) {
  if (version.effectiveFrom > onDate) {
    return false;
  }

  return version.effectiveTo === null || version.effectiveTo >= onDate;
}

/**
 * The active version that covered `onDate`. If data ever allowed more than one
 * (the database prevents overlapping active versions), the most recently started
 * version wins.
 */
export function resolveApplicablePlanVersion(
  versions: readonly PlanVersionWindow[],
  onDate: string,
): PlanVersionWindow | null {
  const candidates = versions
    .filter((version) => version.active && isVersionEffectiveOn(version, onDate))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return candidates[0] ?? null;
}

/**
 * The plan/version snapshot to attach to a job at the moment it is sold.
 * Returns null when the job has no sold date or no version was effective then —
 * the caller decides whether that is a warning or a blocker.
 */
export function resolveSalePlanSnapshot({
  versions,
  soldDate,
}: {
  versions: readonly PlanVersionWindow[];
  soldDate: string | null | undefined;
}): PlanSnapshot | null {
  if (!soldDate) {
    return null;
  }

  const version = resolveApplicablePlanVersion(versions, soldDate);

  if (!version) {
    return null;
  }

  return {
    commissionPlanId: version.commissionPlanId,
    commissionPlanVersionId: version.id,
  };
}

export type TierBound = {
  thresholdType: ThresholdType;
  /**
   * For `fixed` this is an absolute decimal GP (0.25 = 25%). For
   * `project_minimum` it is an offset in decimal GP points from the category
   * minimum, where null means 0 (exactly the category minimum).
   */
  value: number | null;
};

/**
 * Converts a tier bound into an absolute decimal GP so the same band can be
 * compared against any project category's minimum standard.
 */
export function resolveTierBound(
  bound: TierBound,
  minimumGpStandard: number,
): number | null {
  const offset = bound.value ?? 0;

  if (bound.thresholdType === "project_minimum") {
    return roundPercent(minimumGpStandard + offset);
  }

  if (bound.value === null) {
    return null;
  }

  return roundPercent(bound.value);
}

export type TierWindow = {
  sortOrder: number;
  label: string | null;
  rate: number;
  lower: TierBound;
  upper: TierBound;
};

/** True when a decimal GP percentage falls inside a tier's band. */
export function tierContainsGpPercent(
  tier: TierWindow,
  gpPercent: number,
  minimumGpStandard: number,
) {
  const lower = resolveTierBound(tier.lower, minimumGpStandard);
  const upper = resolveTierBound(tier.upper, minimumGpStandard);

  if (lower !== null && gpPercent < lower) {
    return false;
  }

  if (upper !== null && gpPercent >= upper) {
    return false;
  }

  return true;
}

/** The tier that would govern a job, evaluated highest band first. */
export function resolveTierForGpPercent(
  tiers: readonly TierWindow[],
  gpPercent: number,
  minimumGpStandard: number,
) {
  return (
    [...tiers]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((tier) => tierContainsGpPercent(tier, gpPercent, minimumGpStandard)) ?? null
  );
}
