import { cache } from "react";

import { computeJobFinancials, toNumber } from "@/lib/commission/financials";
import {
  resolveApplicablePlanVersion,
  type PlanVersionWindow,
} from "@/lib/commission/plan-resolution";
import { isAdjustmentType, type AdjustmentType } from "@/lib/commission/types";
import type {
  CommissionPlanRow,
  CommissionPlanVersionRow,
  CommissionTierRow,
  JobFinancialAdjustmentRow,
  JobRow,
  AuditEventRow,
  EmployeeCommissionAssignmentRow,
  EmployeeCommissionSettingsRow,
  ProfileRow,
  ProjectCategoryRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayNameFor } from "@/lib/auth/identity";

/**
 * Read access for the commission domain.
 *
 * Everything here runs with the request-scoped Supabase client, so Row Level
 * Security decides what the signed-in user can see. Nothing bypasses it.
 */

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) {
    console.error(`Commission query failed (${context}):`, result.error.message);
    throw new Error(`Could not load ${context}.`);
  }

  return (result.data ?? [] ) as T;
}

function requireRow<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T | null {
  if (result.error) {
    console.error(`Commission query failed (${context}):`, result.error.message);
    throw new Error(`Could not load ${context}.`);
  }

  return result.data ?? null;
}

type ProfileNameFields = {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

function nameFromProfile(profile: ProfileNameFields | null | undefined) {
  if (!profile) return null;

  return displayNameFor(
    {
      display_name: profile.display_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email ?? null,
    } as ProfileRow,
    profile.email ?? null,
  );
}

// ---------------------------------------------------------------------------
// Project categories
// ---------------------------------------------------------------------------

export const listProjectCategories = cache(async function listProjectCategories(
  options: { includeInactive?: boolean } = {},
) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("project_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  return unwrap<ProjectCategoryRow[]>(await query, "project categories");
});

// ---------------------------------------------------------------------------
// Commission plans, versions and tiers
// ---------------------------------------------------------------------------

export type PlanVersionWithTiers = CommissionPlanVersionRow & {
  tiers: CommissionTierRow[];
};

export type PlanWithVersions = CommissionPlanRow & {
  versions: PlanVersionWithTiers[];
};

export const listCommissionPlans = cache(async function listCommissionPlans() {
  const supabase = await createSupabaseServerClient();

  const [plans, versions, tiers] = await Promise.all([
    supabase.from("commission_plans").select("*").order("name", { ascending: true }),
    supabase
      .from("commission_plan_versions")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabase
      .from("commission_tiers")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  const planRows = unwrap<CommissionPlanRow[]>(plans, "commission plans");
  const versionRows = unwrap<CommissionPlanVersionRow[]>(versions, "plan versions");
  const tierRows = unwrap<CommissionTierRow[]>(tiers, "commission tiers");

  return planRows.map<PlanWithVersions>((plan) => ({
    ...plan,
    versions: versionRows
      .filter((version) => version.commission_plan_id === plan.id)
      .map((version) => ({
        ...version,
        tiers: tierRows.filter((tier) => tier.commission_plan_version_id === version.id),
      })),
  }));
});

export const listPlanSelectOptions = cache(async function listPlanSelectOptions() {
  const plans = await listCommissionPlans();

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    active: plan.active,
    versions: plan.versions
      .filter((version) => version.active)
      .map((version) => ({
        id: version.id,
        versionName: version.version_name,
        effectiveFrom: version.effective_from,
        effectiveTo: version.effective_to,
      })),
  }));
});

// ---------------------------------------------------------------------------
// Employees and their commission setup
// ---------------------------------------------------------------------------

export type EmployeeCommissionOverview = {
  profile: ProfileRow;
  settings: EmployeeCommissionSettingsRow | null;
  currentAssignment: EmployeeCommissionAssignmentRow | null;
  currentPlanName: string | null;
  currentVersionName: string | null;
  assignmentHistory: EmployeeCommissionAssignmentRow[];
};

export const listEmployeeCommissionOverview = cache(
  async function listEmployeeCommissionOverview() {
    const supabase = await createSupabaseServerClient();

    const [profiles, settings, assignments, plans] = await Promise.all([
      supabase.from("profiles").select("*").order("first_name", { ascending: true }),
      supabase.from("employee_commission_settings").select("*"),
      supabase
        .from("employee_commission_assignments")
        .select("*")
        .order("effective_from", { ascending: false }),
      supabase.from("commission_plans").select("id, name"),
    ]);

    const profileRows = unwrap<ProfileRow[]>(profiles, "employees");
    const settingsRows = unwrap<EmployeeCommissionSettingsRow[]>(settings, "commission settings");
    const assignmentRows = unwrap<EmployeeCommissionAssignmentRow[]>(
      assignments,
      "commission assignments",
    );
    const planRows = unwrap<Pick<CommissionPlanRow, "id" | "name">[]>(
      plans,
      "commission plans",
    );

    const planNameById = new Map(planRows.map((plan) => [plan.id, plan.name]));
    const versionWindowById = new Map<string, PlanVersionWindow>();

    const versionRows = unwrap<CommissionPlanVersionRow[]>(
      await supabase.from("commission_plan_versions").select("*"),
      "plan versions",
    );
    const versionNameById = new Map(versionRows.map((version) => [version.id, version.version_name]));

    for (const version of versionRows) {
      versionWindowById.set(version.id, {
        id: version.id,
        commissionPlanId: version.commission_plan_id,
        versionName: version.version_name,
        effectiveFrom: version.effective_from,
        effectiveTo: version.effective_to,
        active: version.active,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    function currentVersionFor(planId: string | null | undefined) {
      if (!planId) return null;

      const windows = [...versionWindowById.values()].filter(
        (version) => version.commissionPlanId === planId,
      );

      return resolveApplicablePlanVersion(windows, today);
    }

    return profileRows.map<EmployeeCommissionOverview>((profile) => {
      const employeeAssignments = assignmentRows.filter(
        (assignment) => assignment.profile_id === profile.id,
      );
      const currentAssignment =
        employeeAssignments.find((assignment) => {
          if (assignment.effective_from > today) return false;
          return assignment.effective_to === null || assignment.effective_to >= today;
        }) ?? null;
      const currentPlanId =
        currentAssignment?.commission_plan_id ?? null;
      const currentVersion = currentVersionFor(currentPlanId);

      return {
        profile,
        settings: settingsRows.find((row) => row.profile_id === profile.id) ?? null,
        currentAssignment,
        currentPlanName: currentPlanId ? planNameById.get(currentPlanId) ?? null : null,
        currentVersionName: currentVersion
          ? versionNameById.get(currentVersion.id) ?? null
          : null,
        assignmentHistory: employeeAssignments,
      };
    });
  },
);

export type DesignerOption = {
  id: string;
  name: string;
  email: string | null;
  commissionEligible: boolean;
  currentPlanId: string | null;
  currentPlanName: string | null;
  hasCurrentAssignment: boolean;
};

/**
 * Active profiles for the sales-designer picker. The UI warns (but does not
 * block) when the selected designer has no commission plan assigned.
 */
export const listDesignerOptions = cache(async function listDesignerOptions() {
  const overview = await listEmployeeCommissionOverview();

  return overview
    .filter((row) => row.profile.active)
    .map<DesignerOption>((row) => ({
      id: row.profile.id,
      name: displayNameFor(row.profile, row.profile.email),
      email: row.profile.email,
      commissionEligible: row.settings?.commission_eligible ?? false,
      currentPlanId: row.currentAssignment?.commission_plan_id ?? null,
      currentPlanName: row.currentPlanName,
      hasCurrentAssignment: Boolean(row.currentAssignment),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export type JobListItem = {
  id: string;
  jobNumber: string | null;
  jobName: string;
  customerName: string | null;
  status: string;
  categoryName: string | null;
  categoryCode: string | null;
  salesDesignerName: string | null;
  actualTotalRevenue: number;
  jobGrossProfit: number;
  jobGpPercent: number;
  commissionableGrossProfit: number;
  commissionableGpPercent: number;
};

export const listJobs = cache(async function listJobs() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, job_number, job_name, customer_name, status, actual_total_revenue, job_gross_profit, job_gp_percent, commissionable_gross_profit, commissionable_gp_percent, created_at, project_categories ( name, code ), sales_designer:profiles!jobs_sales_designer_id_fkey ( display_name, first_name, last_name, email )",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Commission query failed (jobs):", error.message);
    throw new Error("Could not load jobs.");
  }

  return (data ?? []).map<JobListItem>((row) => ({
    id: row.id,
    jobNumber: row.job_number,
    jobName: row.job_name,
    customerName: row.customer_name,
    status: row.status,
    categoryName: row.project_categories?.name ?? null,
    categoryCode: row.project_categories?.code ?? null,
    salesDesignerName: nameFromProfile(row.sales_designer),
    actualTotalRevenue: toNumber(row.actual_total_revenue),
    jobGrossProfit: toNumber(row.job_gross_profit),
    jobGpPercent: toNumber(row.job_gp_percent),
    commissionableGrossProfit: toNumber(row.commissionable_gross_profit),
    commissionableGpPercent: toNumber(row.commissionable_gp_percent),
  }));
});

export type JobDetail = {
  job: JobRow;
  category: ProjectCategoryRow | null;
  designer: ProfileRow | null;
  adjustments: JobFinancialAdjustmentRow[];
  auditEvents: AuditEventRow[];
  plan: Pick<CommissionPlanRow, "id" | "name"> | null;
  planVersion: Pick<
    CommissionPlanVersionRow,
    "id" | "version_name" | "effective_from" | "effective_to" | "active"
  > | null;
  planVersionTiers: CommissionTierRow[];
};

export const getJobDetail = cache(async function getJobDetail(jobId: string) {
  const supabase = await createSupabaseServerClient();

  const job = requireRow<JobRow>(
    await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle(),
    "job",
  );

  if (!job) {
    return null;
  }

  const [category, designer, adjustments, auditEvents, plan, planVersion, planVersionTiers] =
    await Promise.all([
      supabase
        .from("project_categories")
        .select("*")
        .eq("id", job.project_category_id)
        .maybeSingle(),
      job.sales_designer_id
        ? supabase.from("profiles").select("*").eq("id", job.sales_designer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("job_financial_adjustments")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_events")
        .select("*")
        .eq("entity_type", "job")
        .eq("entity_id", job.id)
        .order("created_at", { ascending: false })
        .limit(100),
      job.commission_plan_id
        ? supabase
            .from("commission_plans")
            .select("id, name")
            .eq("id", job.commission_plan_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      job.commission_plan_version_id
        ? supabase
            .from("commission_plan_versions")
            .select("id, version_name, effective_from, effective_to, active")
            .eq("id", job.commission_plan_version_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      job.commission_plan_version_id
        ? supabase
            .from("commission_tiers")
            .select("*")
            .eq("commission_plan_version_id", job.commission_plan_version_id)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  return {
    job,
    category: requireRow<ProjectCategoryRow>(category, "project category"),
    designer: requireRow<ProfileRow>(designer, "sales designer"),
    adjustments: unwrap<JobFinancialAdjustmentRow[]>(adjustments, "job adjustments"),
    auditEvents: unwrap<AuditEventRow[]>(auditEvents, "job audit trail"),
    plan: requireRow<Pick<CommissionPlanRow, "id" | "name">>(plan, "commission plan"),
    planVersion: requireRow<
      Pick<
        CommissionPlanVersionRow,
        "id" | "version_name" | "effective_from" | "effective_to" | "active"
      >
    >(planVersion, "commission plan version"),
    planVersionTiers: unwrap<CommissionTierRow[]>(planVersionTiers, "commission tiers"),
  } satisfies JobDetail;
});

/** Derived figures recomputed from the stored inputs — used to detect drift. */
export function recomputeJobFinancials(job: JobRow, adjustments: JobFinancialAdjustmentRow[]) {
  return computeJobFinancials(
    {
      contractRevenue: toNumber(job.contract_revenue),
      changeOrderRevenue: toNumber(job.change_order_revenue),
      creditAmount: toNumber(job.credit_amount),
      otherRevenue: toNumber(job.other_revenue),
      materialCost: toNumber(job.material_cost),
      laborCost: toNumber(job.labor_cost),
      subcontractorCost: toNumber(job.subcontractor_cost),
      otherDirectCost: toNumber(job.other_direct_cost),
      burdenCost: toNumber(job.burden_cost),
      warrantyServiceContingency: toNumber(job.warranty_service_contingency),
    },
    adjustments
      .filter(
        (
          adjustment,
        ): adjustment is JobFinancialAdjustmentRow & {
          adjustment_type: AdjustmentType;
        } => isAdjustmentType(adjustment.adjustment_type),
      )
      .map((adjustment) => ({
        adjustmentType: adjustment.adjustment_type,
        amount: toNumber(adjustment.amount),
      })),
  );
}
