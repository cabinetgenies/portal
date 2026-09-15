import { cache } from "react";

import {
  computeJobFinancials,
  jobFinancialInputsFromRow,
  toNumber,
  ZERO_JOB_COST_RATES,
  type JobCostRateDefaults,
} from "@/lib/commission/financials";
import { isAdjustmentType, type AdjustmentType } from "@/lib/commission/types";
import type {
  AuditEventRow,
  CompensationPlanRow,
  CompensationPlanTierRow,
  CompensationPlanVersionRow,
  JobChangeOrderRow,
  JobFinancialAdjustmentRow,
  JobRow,
  ProfileRow,
} from "@/lib/supabase/database.types";
import { requireRow, unwrap } from "@/lib/supabase/results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read access for jobs.
 *
 * Everything runs with the request-scoped Supabase client, so Row Level Security
 * decides which jobs the signed-in user can see. Compensation *rules* are read
 * through lib/compensation/queries.ts.
 */

export type JobDetail = {
  job: JobRow;
  designer: ProfileRow | null;
  adjustments: JobFinancialAdjustmentRow[];
  changeOrders: JobChangeOrderRow[];
  auditEvents: AuditEventRow[];
  plan: Pick<CompensationPlanRow, "id" | "name" | "participant_kind"> | null;
  planVersion: Pick<
    CompensationPlanVersionRow,
    "id" | "version_name" | "effective_from" | "effective_to" | "active"
  > | null;
  planVersionTiers: CompensationPlanTierRow[];
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

  const [
    designer,
    adjustments,
    changeOrders,
    auditEvents,
    plan,
    planVersion,
    planVersionTiers,
  ] = await Promise.all([
      job.sales_designer_id
        ? supabase.from("profiles").select("*").eq("id", job.sales_designer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("job_financial_adjustments")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("job_change_orders")
        .select("*")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("audit_events")
        .select("*")
        .eq("entity_type", "job")
        .eq("entity_id", job.id)
        .order("created_at", { ascending: false })
        .limit(100),
      job.compensation_plan_id
        ? supabase
            .from("compensation_plans")
            .select("id, name, participant_kind")
            .eq("id", job.compensation_plan_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      job.compensation_plan_version_id
        ? supabase
            .from("compensation_plan_versions")
            .select("id, version_name, effective_from, effective_to, active")
            .eq("id", job.compensation_plan_version_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      job.compensation_plan_version_id
        ? supabase
            .from("compensation_plan_tiers")
            .select("*")
            .eq("compensation_plan_version_id", job.compensation_plan_version_id)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

  return {
    job,
    designer: requireRow<ProfileRow>(designer, "sales designer"),
    adjustments: unwrap<JobFinancialAdjustmentRow[]>(adjustments, "job adjustments"),
    changeOrders: unwrap<JobChangeOrderRow[]>(changeOrders, "change orders"),
    auditEvents: unwrap<AuditEventRow[]>(auditEvents, "job audit trail"),
    plan: requireRow<Pick<CompensationPlanRow, "id" | "name" | "participant_kind">>(
      plan,
      "compensation plan",
    ),
    planVersion: requireRow<
      Pick<
        CompensationPlanVersionRow,
        "id" | "version_name" | "effective_from" | "effective_to" | "active"
      >
    >(planVersion, "compensation plan version"),
    planVersionTiers: unwrap<CompensationPlanTierRow[]>(planVersionTiers, "compensation tiers"),
  } satisfies JobDetail;
});

/**
 * The revenue/cost inputs from a stored job row, ready for the domain functions.
 *
 * Burden and warranty / service contingency are rates, not amounts: the job's own
 * snapshot wins, and `defaults` (the company settings in force) only covers a job
 * that has never been saved with a rate.
 */
export function financialInputsFromJob(
  job: JobRow,
  defaults: JobCostRateDefaults = ZERO_JOB_COST_RATES,
) {
  return jobFinancialInputsFromRow(job, defaults);
}

/** Stored adjustments narrowed to the supported types. */
export function adjustmentInputsFromRows(rows: readonly JobFinancialAdjustmentRow[]) {
  return rows
    .filter(
      (
        row,
      ): row is JobFinancialAdjustmentRow & { adjustment_type: AdjustmentType } =>
        isAdjustmentType(row.adjustment_type),
    )
    .map((row) => ({
      adjustmentType: row.adjustment_type,
      amount: toNumber(row.amount),
    }));
}

/** Derived figures recomputed from the stored inputs and adjustments. */
export function recomputeJobFinancials(
  job: JobRow,
  adjustments: readonly JobFinancialAdjustmentRow[],
  defaults: JobCostRateDefaults = ZERO_JOB_COST_RATES,
) {
  return computeJobFinancials(
    financialInputsFromJob(job, defaults),
    adjustmentInputsFromRows(adjustments),
  );
}
