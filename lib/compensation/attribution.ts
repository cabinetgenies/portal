/**
 * Team attribution primitives for future sales manager compensation.
 *
 * These resolve *relationships only* — who managed whom on a date — and never
 * money. They mirror the SQL functions
 * `public.manager_of_profile_at(profile_id, on_date)` and
 * `public.direct_report_ids_at(manager_id, on_date)` so a future bonus service
 * can use whichever side of the boundary it lives on.
 *
 * No bonus is calculated anywhere in this phase.
 */

export type ReportingPeriod = {
  profileId: string;
  managerId: string;
  /** Inclusive start date, ISO `YYYY-MM-DD`. */
  effectiveFrom: string;
  /** Inclusive end date, ISO `YYYY-MM-DD`, or null while current. */
  effectiveTo: string | null;
};

export function isReportingPeriodInForce(period: ReportingPeriod, onDate: string) {
  if (period.effectiveFrom > onDate) {
    return false;
  }

  return period.effectiveTo === null || period.effectiveTo >= onDate;
}

/**
 * The manager in force for one person on a date. ISO dates compare correctly as
 * strings.
 */
export function resolveManagerAt(
  periods: readonly ReportingPeriod[],
  profileId: string,
  onDate: string,
): string | null {
  const inForce = periods
    .filter(
      (period) => period.profileId === profileId && isReportingPeriodInForce(period, onDate),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));

  return inForce[0]?.managerId ?? null;
}

/** Every direct report of a manager on a date. */
export function resolveDirectReportIdsAt(
  periods: readonly ReportingPeriod[],
  profileIds: readonly string[],
  managerId: string,
  onDate: string,
): string[] {
  return profileIds
    .filter((profileId) => resolveManagerAt(periods, profileId, onDate) === managerId)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * The manager a job is attributed to. A later phase will snapshot this on the
 * job at sale time so that changing a person's current manager can never rewrite
 * historical bonus attribution.
 */
export function resolveJobManagerAttribution({
  periods,
  salesDesignerId,
  attributionDate,
}: {
  periods: readonly ReportingPeriod[];
  salesDesignerId: string | null;
  attributionDate: string | null;
}): string | null {
  if (!salesDesignerId || !attributionDate) {
    return null;
  }

  return resolveManagerAt(periods, salesDesignerId, attributionDate);
}
