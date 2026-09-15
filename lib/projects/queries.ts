import { jobStatusLabel, jobStatusTone, type StatusTone } from "@/lib/commission/types";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { JobRow } from "@/lib/supabase/database.types";

/**
 * Project records.
 *
 * A project in this portal is a `jobs` row. Buildertrend remains the execution
 * system of record for project delivery, and nothing here tries to replace it —
 * this is the portal's own view of the jobs it is responsible for, under the job
 * policies that already exist. No project data is invented or duplicated.
 */

export type ProjectListItem = {
  id: string;
  name: string;
  customerName: string | null;
  statusLabel: string;
  statusTone: StatusTone;
  soldDate: string | null;
  href: string;
};

export async function listVisibleProjects({
  profileId,
  canViewAllJobs,
  limit = 25,
}: {
  profileId: string | null;
  canViewAllJobs: boolean;
  limit?: number;
}): Promise<{ items: ProjectListItem[]; failed: boolean }> {
  if (!isSupabaseConfigured) {
    return { items: [], failed: true };
  }

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    // A designer sees their own projects; anyone whose role grants wider job
    // visibility sees what Row Level Security gives them.
    if (!canViewAllJobs && profileId) {
      query = query.eq("sales_designer_id", profileId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Could not load projects:", error.message);
      return { items: [], failed: true };
    }

    return {
      items: ((data ?? []) as JobRow[]).map((job) => ({
        id: job.id,
        name: job.job_name,
        customerName: job.customer_name,
        statusLabel: jobStatusLabel(job.status),
        statusTone: jobStatusTone(job.status),
        soldDate: job.sold_date,
        href: `/sales/commissions/jobs/${job.id}`,
      })),
      failed: false,
    };
  } catch (error) {
    console.error("Could not load projects:", error);
    return { items: [], failed: true };
  }
}
