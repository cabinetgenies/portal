import { jobStatusLabel, jobStatusTone, type StatusTone } from "@/lib/commission/types";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProjectShellRecord = {
  id: string;
  name: string;
  projectNumber: string | null;
  customerName: string | null;
  designerName: string | null;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  soldDate: string | null;
};

export async function getProjectShell(projectId: string): Promise<ProjectShellRecord | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, job_name, job_number, customer_name, sales_designer_id, status, sold_date")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !job) {
    if (error) console.error("Could not load project shell:", error.message);
    return null;
  }

  let designerName: string | null = null;

  if (job.sales_designer_id) {
    const { data: designer } = await supabase
      .from("profiles")
      .select("display_name, first_name, last_name, email")
      .eq("id", job.sales_designer_id)
      .maybeSingle();

    if (designer) {
      const combined = [designer.first_name, designer.last_name].filter(Boolean).join(" ");
      designerName = combined || designer.display_name || designer.email || null;
    }
  }

  return {
    id: job.id,
    name: job.job_name,
    projectNumber: job.job_number,
    customerName: job.customer_name,
    designerName,
    status: job.status,
    statusLabel: jobStatusLabel(job.status),
    statusTone: jobStatusTone(job.status),
    soldDate: job.sold_date,
  };
}
