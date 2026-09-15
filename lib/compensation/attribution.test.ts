import assert from "node:assert/strict";
import test from "node:test";

import {
  isReportingPeriodInForce,
  resolveDirectReportIdsAt,
  resolveJobManagerAttribution,
  resolveManagerAt,
  type ReportingPeriod,
} from "@/lib/compensation/attribution";

const period = (
  overrides: Partial<ReportingPeriod> & { profileId: string; managerId: string },
): ReportingPeriod => ({
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  ...overrides,
});

test("a reporting period is inclusive on both ends", () => {
  const window = period({
    profileId: "designer-1",
    managerId: "manager-a",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-06-30",
  });

  assert.equal(isReportingPeriodInForce(window, "2025-12-31"), false);
  assert.equal(isReportingPeriodInForce(window, "2026-01-01"), true);
  assert.equal(isReportingPeriodInForce(window, "2026-06-30"), true);
  assert.equal(isReportingPeriodInForce(window, "2026-07-01"), false);
});

test("the manager on a date is the manager in force, not the current one", () => {
  const periods: ReportingPeriod[] = [
    period({
      profileId: "designer-1",
      managerId: "manager-a",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
    }),
    period({
      profileId: "designer-1",
      managerId: "manager-b",
      effectiveFrom: "2026-07-01",
      effectiveTo: null,
    }),
  ];

  assert.equal(resolveManagerAt(periods, "designer-1", "2026-03-15"), "manager-a");
  assert.equal(resolveManagerAt(periods, "designer-1", "2026-09-01"), "manager-b");
});

test("a person with no reporting history has no manager for that date", () => {
  assert.equal(resolveManagerAt([], "designer-1", "2026-03-15"), null);
});

test("direct reports are resolved as of the date, so a team change does not rewrite history", () => {
  const periods: ReportingPeriod[] = [
    period({
      profileId: "designer-1",
      managerId: "manager-a",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
    }),
    period({
      profileId: "designer-1",
      managerId: "manager-b",
      effectiveFrom: "2026-07-01",
    }),
    period({ profileId: "designer-2", managerId: "manager-a", effectiveFrom: "2026-02-01" }),
  ];
  const profiles = ["designer-1", "designer-2", "designer-3"];

  assert.deepEqual(
    resolveDirectReportIdsAt(periods, profiles, "manager-a", "2026-03-15"),
    ["designer-1", "designer-2"],
  );
  assert.deepEqual(
    resolveDirectReportIdsAt(periods, profiles, "manager-a", "2026-09-15"),
    ["designer-2"],
  );
});

test("job attribution resolves to the manager in force on the attribution date", () => {
  const periods: ReportingPeriod[] = [
    period({
      profileId: "designer-1",
      managerId: "manager-a",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
    }),
    period({
      profileId: "designer-1",
      managerId: "manager-b",
      effectiveFrom: "2026-07-01",
    }),
  ];

  const attributed = resolveJobManagerAttribution({
    periods,
    salesDesignerId: "designer-1",
    attributionDate: "2026-05-20",
  });

  assert.equal(attributed, "manager-a");

  // A later team change does not rewrite the job's attribution.
  assert.equal(
    resolveJobManagerAttribution({
      periods,
      salesDesignerId: "designer-1",
      attributionDate: "2026-05-20",
    }),
    "manager-a",
  );
});

test("a job with no designer or no attribution date has no manager attribution", () => {
  const periods: ReportingPeriod[] = [
    period({ profileId: "designer-1", managerId: "manager-a" }),
  ];

  assert.equal(
    resolveJobManagerAttribution({ periods, salesDesignerId: null, attributionDate: "2026-05-20" }),
    null,
  );
  assert.equal(
    resolveJobManagerAttribution({ periods, salesDesignerId: "designer-1", attributionDate: null }),
    null,
  );
});
