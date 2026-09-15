import {
  FINAL_AUDIT_STATE_LABELS,
  deriveFinalAuditState,
  type FinalAuditState,
} from "@/lib/commission/audit";
import { loadCommissionWorkspace, projectedCommissionForJob } from "@/lib/commission/event-queries";
import { roundMoney, toNumber } from "@/lib/commission/financials";
import { jobStatusLabel, jobStatusTone, type StatusTone } from "@/lib/commission/types";
import { isSupabaseConfigured } from "@/lib/env";
import { PROJECT_ROUTES } from "@/lib/routes";
import type { JobRow, ProfileRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Projects.
 *
 * A project in this portal is a `jobs` row, and it is the shared parent entity:
 * sales and commissions are views over the same record, so the project list and
 * the project detail page read this module and nothing owns a second copy of it.
 *
 * Nothing here recalculates anything. Revenue, cost, gross profit and GP% are the
 * stored figures the commission domain already derives; the projected commission
 * comes from the commission engine's own view model
 * (`projectedCommissionForJob`), and the audit state from the same
 * `deriveFinalAuditState` the audit workflow uses. When a viewer's role cannot
 * read commission configuration — a project manager, say — those two columns
 * degrade to "not available" rather than inventing a number.
 *
 * Buildertrend remains the execution system of record. There is deliberately no
 * schedule, task list, calendar or daily log here.
 */

export type ProjectScope = "visible" | "own";

export type ProjectSummary = {
  id: string;
  name: string;
  projectNumber: string | null;
  customerName: string | null;
  designerName: string | null;
  statusLabel: string;
  statusTone: StatusTone;
  soldDate: string | null;
  createdAt: string;
  href: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  gpPercent: number;
  /** Null when the viewer's role cannot read commission configuration. */
  projectedCommission: number | null;
  auditState: FinalAuditState | null;
  auditStateLabel: string | null;
};

export type ProjectListResult = {
  items: ProjectSummary[];
  /** A real read failure, as opposed to an empty list. */
  failed: boolean;
  /**
   * "available"   the commission view model resolved for this viewer
   * "unavailable" the commission tables could not be read at all
   */
  commission: "available" | "unavailable";
};

/** The light shape the dashboard widget uses. */
export type ProjectListItem = {
  id: string;
  name: string;
  customerName: string | null;
  statusLabel: string;
  statusTone: StatusTone;
  soldDate: string | null;
  href: string;
};

async function loadJobs({
  profileId,
  scope,
  limit,
}: {
  profileId: string | null;
  scope: ProjectScope;
  limit: number;
}): Promise<{ rows: JobRow[]; failed: boolean }> {
  if (!isSupabaseConfigured) {
    return { rows: [], failed: true };
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    // "own" is the dashboard's "my projects"; "visible" is everything the
    // viewer's role lets them read, which is what Row Level Security already
    // decided. Neither widens access.
    if (scope === "own" && profileId) {
      query = query.eq("sales_designer_id", profileId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Could not load projects:", error.message);
      return { rows: [], failed: true };
    }

    return { rows: (data ?? []) as JobRow[], failed: false };
  } catch (error) {
    console.error("Could not load projects:", error);
    return { rows: [], failed: true };
  }
}

function designerName(profile: ProfileRow | undefined | null) {
  if (!profile) return null;

  const combined = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  return combined || profile.display_name || profile.email || null;
}

/**
 * The canonical project list.
 *
 * One row per project with the figures the portal actually stores, and commission
 * columns sourced from the existing commission engine rather than derived again.
 */
export async function listProjectSummaries({
  profileId,
  scope = "visible",
  limit = 100,
}: {
  profileId: string | null;
  scope?: ProjectScope;
  limit?: number;
}): Promise<ProjectListResult> {
  const { rows: jobs, failed } = await loadJobs({ profileId, scope, limit });

  if (failed) {
    return { items: [], failed: true, commission: "unavailable" };
  }

  if (jobs.length === 0) {
    return { items: [], failed: false, commission: "available" };
  }

  const profilesById = await loadProfilesById(
    jobs.map((job) => job.sales_designer_id).filter((id): id is string => Boolean(id)),
  );
  const auditsByJob = await loadAuditRows(jobs.map((job) => job.id));

  // The commission view model: projections and the final true-up status. A role
  // that cannot read commission configuration gets nulls, not a guess.
  let workspace: Awaited<ReturnType<typeof loadCommissionWorkspace>> | null = null;

  try {
    workspace = await loadCommissionWorkspace();
  } catch (error) {
    console.error("Could not load the commission view model for the project list:", error);
  }

  const finalEventStatusByJob = new Map<string, string>();

  for (const event of workspace?.events ?? []) {
    if (event.event_type === "final_true_up") {
      finalEventStatusByJob.set(event.job_id, event.status);
    }
  }

  const items = jobs.map<ProjectSummary>((job) => {
    const projection = workspace ? projectedCommissionForJob(workspace, job) : null;
    const audits = auditsByJob.get(job.id) ?? [];
    const auditState = workspace
      ? deriveFinalAuditState({
          audits,
          finalEventStatus: finalEventStatusByJob.get(job.id) ?? null,
        })
      : null;

    return {
      id: job.id,
      name: job.job_name,
      projectNumber: job.job_number,
      customerName: job.customer_name,
      designerName: designerName(
        job.sales_designer_id ? profilesById.get(job.sales_designer_id) : null,
      ),
      statusLabel: jobStatusLabel(job.status),
      statusTone: jobStatusTone(job.status),
      soldDate: job.sold_date,
      createdAt: job.created_at,
      href: PROJECT_ROUTES.project(job.id),
      revenue: roundMoney(toNumber(job.actual_total_revenue)),
      cost: roundMoney(toNumber(job.actual_total_cost)),
      grossProfit: roundMoney(toNumber(job.job_gross_profit)),
      gpPercent: toNumber(job.job_gp_percent),
      projectedCommission: projection ? roundMoney(projection.netPayable) : null,
      auditState,
      auditStateLabel: auditState ? FINAL_AUDIT_STATE_LABELS[auditState] : null,
    };
  });

  return {
    items,
    failed: false,
    commission: workspace ? "available" : "unavailable",
  };
}

/** The dashboard widget's lighter view of the same records. */
export async function listVisibleProjects({
  profileId,
  scope = "own",
  limit = 5,
}: {
  profileId: string | null;
  scope?: ProjectScope;
  limit?: number;
}): Promise<{ items: ProjectListItem[]; failed: boolean }> {
  const { rows, failed } = await loadJobs({ profileId, scope, limit });

  return {
    items: rows.map((job) => ({
      id: job.id,
      name: job.job_name,
      customerName: job.customer_name,
      statusLabel: jobStatusLabel(job.status),
      statusTone: jobStatusTone(job.status),
      soldDate: job.sold_date,
      href: PROJECT_ROUTES.project(job.id),
    })),
    failed,
  };
}

async function loadProfilesById(ids: readonly string[]): Promise<Map<string, ProfileRow>> {
  const profiles = new Map<string, ProfileRow>();
  const unique = Array.from(new Set(ids));

  if (unique.length === 0 || !isSupabaseConfigured) return profiles;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("profiles").select("*").in("id", unique);

    // Row Level Security may legitimately hide a designer's profile from a
    // viewer; the column then reads as unknown rather than failing the page.
    if (error) {
      console.error("Could not load project designers:", error.message);
      return profiles;
    }

    for (const profile of (data ?? []) as ProfileRow[]) {
      profiles.set(profile.id, profile);
    }
  } catch (error) {
    console.error("Could not load project designers:", error);
  }

  return profiles;
}

type AuditRow = { job_id: string; status: string; revision: number };

async function loadAuditRows(jobIds: readonly string[]): Promise<Map<string, AuditRow[]>> {
  const byJob = new Map<string, AuditRow[]>();
  const unique = Array.from(new Set(jobIds));

  if (unique.length === 0 || !isSupabaseConfigured) return byJob;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("commission_audits")
      .select("job_id, status, revision")
      .in("job_id", unique)
      .order("revision", { ascending: false });

    if (error) {
      console.error("Could not load project audit state:", error.message);
      return byJob;
    }

    for (const row of (data ?? []) as AuditRow[]) {
      byJob.set(row.job_id, [...(byJob.get(row.job_id) ?? []), row]);
    }
  } catch (error) {
    console.error("Could not load project audit state:", error);
  }

  return byJob;
}
