import { cache } from "react";

import { displayNameFor } from "@/lib/auth/identity";
import {
  deriveFinalAuditState,
  type FinalAuditState,
} from "@/lib/commission/audit";
import {
  buildCommissionPipeline,
  drawLedgerRows,
  drawSchedule,
  drawTotals,
  rolloverLedgerRows,
  toPipelineItems,
  type CommissionPipeline,
  type DrawScheduleRow,
  type DrawTotals,
  type LedgerTransactionRow,
} from "@/lib/commission/designer-dashboard";
import {
  listEmployeeCommissionSummaries,
  loadCommissionWorkspace,
  projectedCommissionForJob,
  type EmployeeCommissionSummary,
} from "@/lib/commission/event-queries";
import { toNumber } from "@/lib/commission/financials";
import type {
  CommissionAuditRow,
  JobRow,
} from "@/lib/supabase/database.types";
import { unwrap } from "@/lib/supabase/results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The designer commission dashboard.
//
// One batched load per request: the commission workspace (jobs, events, ledgers,
// plans, tiers — all cached and already used by the other commission screens) plus a
// single `commission_audits` query for this designer's jobs. No per-job round trips.
//
// What a role can actually see is decided by Row Level Security, not by this module:
// a sales designer reading their own dashboard gets their own events, ledgers and
// draw periods, and RLS simply returns nothing for the compensation configuration
// their role cannot read.

export type DesignerDashboard = {
  summary: EmployeeCommissionSummary;
  name: string;
  jobs: JobRow[];
  pipeline: CommissionPipeline;
  audits: CommissionAuditRow[];
  auditStates: Map<string, FinalAuditState>;
  recentEvents: ReturnType<typeof toPipelineItems>;
  draw: {
    schedule: DrawScheduleRow[];
    ledger: LedgerTransactionRow[];
    totals: DrawTotals;
    drawRateReduction: number;
  };
  rollover: {
    ledger: LedgerTransactionRow[];
    balance: number;
  };
  metrics: {
    projected: number;
    pendingApproval: number;
    readyToPay: number;
    paidThisMonth: number;
    paidYtd: number;
    outstandingDraw: number;
    outstandingRollover: number;
  };
};

export const getDesignerCommissionDashboard = cache(
  async function getDesignerCommissionDashboard(
    profileId: string,
  ): Promise<DesignerDashboard | null> {
    const [summaries, workspace] = await Promise.all([
      listEmployeeCommissionSummaries(),
      loadCommissionWorkspace(),
    ]);
    const summary = summaries.find((row) => row.profile.id === profileId);

    if (!summary) {
      return null;
    }

    const jobs = workspace.jobs.filter((job) => job.sales_designer_id === profileId);
    const jobIds = new Set(jobs.map((job) => job.id));
    const jobNames = new Map(jobs.map((job) => [job.id, job.job_name]));

    // One query for every audit on this designer's jobs.
    const audits =
      jobs.length === 0
        ? []
        : unwrap<CommissionAuditRow[]>(
            await (await createSupabaseServerClient())
              .from("commission_audits")
              .select("*")
              .in(
                "job_id",
                jobs.map((job) => job.id),
              )
              .order("revision", { ascending: false }),
            "commission audits",
          );

    const auditStates = new Map<string, FinalAuditState>();

    for (const job of jobs) {
      const jobAudits = audits.filter((audit) => audit.job_id === job.id);
      const finalEvent = summary.events.find(
        (event) => event.job_id === job.id && event.event_type === "final_true_up",
      );

      auditStates.set(
        job.id,
        deriveFinalAuditState({
          audits: jobAudits,
          finalEventStatus: finalEvent?.status ?? null,
        }),
      );
    }

    const projections = new Map(
      jobs.map((job) => {
        const projection = projectedCommissionForJob(workspace, job);

        return [
          job.id,
          projection
            ? {
                grossCommission: projection.jobGrossCommission,
                depositTarget: projection.grossCommission,
              }
            : null,
        ] as const;
      }),
    );

    const today = new Date().toISOString().slice(0, 10);
    const monthPrefix = today.slice(0, 7);
    const paidThisMonth = summary.events
      .filter(
        (event) =>
          event.status === "paid" && (event.paid_at ?? "").startsWith(monthPrefix),
      )
      .reduce((total, event) => total + toNumber(event.net_payable), 0);

    // Events for jobs this designer owns only — RLS already filters, this keeps the
    // pipeline honest if a job is reassigned.
    const designerEvents = summary.events.filter((event) => jobIds.has(event.job_id));

    const pipeline = buildCommissionPipeline({
      summary: { ...summary, events: designerEvents },
      jobs,
      projections,
      auditStates,
    });

    return {
      summary,
      name: displayNameFor(summary.profile, summary.profile.email),
      jobs,
      pipeline,
      audits,
      auditStates,
      recentEvents: toPipelineItems({
        events: designerEvents.slice(0, 5),
        jobs,
        auditStates,
      }),
      draw: {
        schedule: drawSchedule(summary.drawPeriods, summary.drawRateReduction, today),
        ledger: drawLedgerRows(summary.drawLedger, jobNames),
        totals: drawTotals(summary.drawLedger),
        drawRateReduction: summary.drawRateReduction,
      },
      rollover: {
        ledger: rolloverLedgerRows(summary.rolloverLedger, jobNames),
        balance: summary.rolloverBalance,
      },
      metrics: {
        projected: summary.projectedCommission,
        pendingApproval: summary.pendingApproval,
        readyToPay: summary.approvedUnpaid,
        paidThisMonth,
        paidYtd: summary.paidYtd,
        outstandingDraw: summary.drawBalance,
        outstandingRollover: summary.rolloverBalance,
      },
    };
  },
);
