import { cache } from "react";

import type { CommissionAuditRow } from "@/lib/supabase/database.types";
import { unwrap } from "@/lib/supabase/results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read access for final commission audits. RLS decides what a role can see: finance
 * and administrators see every audit, a sales designer (or their manager) sees the
 * audits for jobs they can already see.
 */
export const listJobAudits = cache(async function listJobAudits(
  jobId: string,
): Promise<CommissionAuditRow[]> {
  const supabase = await createSupabaseServerClient();
  const result = await supabase
    .from("commission_audits")
    .select("*")
    .eq("job_id", jobId)
    .order("revision", { ascending: false });

  return unwrap<CommissionAuditRow[]>(result, "commission audits");
});
