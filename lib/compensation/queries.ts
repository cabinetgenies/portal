import { cache } from "react";

import { displayNameFor } from "@/lib/auth/identity";
import {
  resolveApplicablePlanVersion,
  type PlanVersionWindow,
} from "@/lib/compensation/plan-resolution";
import type {
  CompensationPlanRow,
  CompensationPlanTierRow,
  CompensationPlanVersionRow,
  EmployeeCompensationAssignmentRow,
  EmployeeCompensationSettingsRow,
  ProfileRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/results";

/**
 * Read access for compensation configuration and employee participation.
 *
 * Everything runs with the request-scoped Supabase client, so Row Level Security
 * decides what the signed-in user can see.
 */

/** ISO date for today, used to resolve the plan in force. */
export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Compensation plans, effective-dated versions and tiers
// ---------------------------------------------------------------------------

export type PlanVersionWithTiers = CompensationPlanVersionRow & {
  tiers: CompensationPlanTierRow[];
};

export type PlanWithVersions = CompensationPlanRow & {
  versions: PlanVersionWithTiers[];
};

export const listCompensationPlans = cache(async function listCompensationPlans() {
  const supabase = await createSupabaseServerClient();

  const [plans, versions, tiers] = await Promise.all([
    supabase.from("compensation_plans").select("*").order("name", { ascending: true }),
    supabase
      .from("compensation_plan_versions")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabase
      .from("compensation_plan_tiers")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  const planRows = unwrap<CompensationPlanRow[]>(plans, "compensation plans");
  const versionRows = unwrap<CompensationPlanVersionRow[]>(versions, "plan versions");
  const tierRows = unwrap<CompensationPlanTierRow[]>(tiers, "plan tiers");

  return planRows.map<PlanWithVersions>((plan) => ({
    ...plan,
    versions: versionRows
      .filter((version) => version.compensation_plan_id === plan.id)
      .map((version) => ({
        ...version,
        tiers: tierRows.filter(
          (tier) => tier.compensation_plan_version_id === version.id,
        ),
      })),
  }));
});

export const listCompensationPlanOptions = cache(
  async function listCompensationPlanOptions() {
    const plans = await listCompensationPlans();

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      active: plan.active,
      participantKind: plan.participant_kind,
      versions: plan.versions
        .filter((version) => version.active)
        .map((version) => ({
          id: version.id,
          versionName: version.version_name,
          effectiveFrom: version.effective_from,
          effectiveTo: version.effective_to,
        })),
    }));
  },
);

// ---------------------------------------------------------------------------
// Employees and their compensation participation
// ---------------------------------------------------------------------------

export type EmployeeCompensationOverview = {
  profile: ProfileRow;
  settings: EmployeeCompensationSettingsRow | null;
  currentAssignment: EmployeeCompensationAssignmentRow | null;
  currentPlan: { id: string; name: string; participantKind: string } | null;
  currentVersionName: string | null;
  assignmentHistory: EmployeeCompensationAssignmentRow[];
};

export const listEmployeeCompensationOverview = cache(
  async function listEmployeeCompensationOverview() {
    const supabase = await createSupabaseServerClient();

    const [profiles, settings, assignments, plans, versions] = await Promise.all([
      supabase.from("profiles").select("*").order("first_name", { ascending: true }),
      supabase.from("employee_compensation_settings").select("*"),
      supabase
        .from("employee_compensation_assignments")
        .select("*")
        .order("effective_from", { ascending: false }),
      supabase.from("compensation_plans").select("id, name, participant_kind"),
      supabase.from("compensation_plan_versions").select("*"),
    ]);

    const profileRows = unwrap<ProfileRow[]>(profiles, "employees");
    const settingsRows = unwrap<EmployeeCompensationSettingsRow[]>(
      settings,
      "compensation settings",
    );
    const assignmentRows = unwrap<EmployeeCompensationAssignmentRow[]>(
      assignments,
      "compensation assignments",
    );
    const planRows = unwrap<
      Pick<CompensationPlanRow, "id" | "name" | "participant_kind">[]
    >(plans, "compensation plans");
    const versionRows = unwrap<CompensationPlanVersionRow[]>(versions, "plan versions");

    const planById = new Map(planRows.map((plan) => [plan.id, plan]));
    const versionNameById = new Map(
      versionRows.map((version) => [version.id, version.version_name]),
    );
    const versionWindows: PlanVersionWindow[] = versionRows.map((version) => ({
      id: version.id,
      commissionPlanId: version.compensation_plan_id,
      versionName: version.version_name,
      effectiveFrom: version.effective_from,
      effectiveTo: version.effective_to,
      active: version.active,
    }));

    const today = todayIso();

    return profileRows.map<EmployeeCompensationOverview>((profile) => {
      const employeeAssignments = assignmentRows.filter(
        (assignment) => assignment.profile_id === profile.id,
      );
      const currentAssignment =
        employeeAssignments.find((assignment) => {
          if (assignment.effective_from > today) return false;
          return assignment.effective_to === null || assignment.effective_to >= today;
        }) ?? null;
      const plan = currentAssignment
        ? planById.get(currentAssignment.compensation_plan_id) ?? null
        : null;
      const currentVersion = plan
        ? resolveApplicablePlanVersion(
            versionWindows.filter((version) => version.commissionPlanId === plan.id),
            today,
          )
        : null;

      return {
        profile,
        settings: settingsRows.find((row) => row.profile_id === profile.id) ?? null,
        currentAssignment,
        currentPlan: plan
          ? { id: plan.id, name: plan.name, participantKind: plan.participant_kind }
          : null,
        currentVersionName: currentVersion
          ? versionNameById.get(currentVersion.id) ?? null
          : null,
        assignmentHistory: employeeAssignments,
      };
    });
  },
);

export type SalesDesignerOption = {
  id: string;
  name: string;
  email: string | null;
  compensationEligible: boolean;
  currentPlanId: string | null;
  currentPlanName: string | null;
  hasCurrentAssignment: boolean;
};

/**
 * Active profiles that can be assigned as the sales designer on a job. The UI
 * warns — but never blocks — when the selected person has no compensation plan
 * assignment in force.
 */
export const listSalesDesignerOptions = cache(async function listSalesDesignerOptions() {
  const overview = await listEmployeeCompensationOverview();

  return overview
    .filter((row) => row.profile.active)
    .map<SalesDesignerOption>((row) => ({
      id: row.profile.id,
      name: displayNameFor(row.profile, row.profile.email),
      email: row.profile.email,
      compensationEligible: row.settings?.compensation_eligible ?? false,
      currentPlanId: row.currentAssignment?.compensation_plan_id ?? null,
      currentPlanName: row.currentPlan?.name ?? null,
      hasCurrentAssignment: Boolean(row.currentAssignment),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});
