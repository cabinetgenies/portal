import { roundMoney, toNumber } from "@/lib/commission/financials";
import type { EmployeeCommissionSummary } from "@/lib/commission/event-queries";
import type { FinalAuditState } from "@/lib/commission/audit";
import {
  commissionEventTypeLabel,
  isCommissionEventStatus,
  isCommissionEventType,
  type StatusTone,
} from "@/lib/commission/types";
import type {
  CommissionEventRow,
  CommissionRolloverLedgerRow,
  EmployeeDrawLedgerRow,
  EmployeeDrawPeriodRow,
  JobRow,
} from "@/lib/supabase/database.types";

// The designer commission dashboard, as data.
//
// Everything here is derived from rows the pages have already loaded in batch, so
// the dashboard is a pure transformation of the workspace plus a small audit lookup.
// Nothing in this module computes money: the figures come from the canonical engine
// (projected commission) or from a commission event's own snapshot.

/** Employee-facing status language, in place of the internal event states. */
export const DESIGNER_STATUS_LABELS: Record<string, string> = {
  calculated: "Projected",
  pending_approval: "Pending approval",
  approved: "Ready to pay",
  paid: "Paid",
  voided: "Voided",
};

export const DESIGNER_STATUS_TONES: Record<string, StatusTone> = {
  calculated: "neutral",
  pending_approval: "warning",
  approved: "info",
  paid: "positive",
  voided: "critical",
};

export function designerStatusLabel(status: string) {
  return isCommissionEventStatus(status)
    ? DESIGNER_STATUS_LABELS[status] ?? status
    : status.replaceAll("_", " ");
}

export function designerStatusTone(status: string): StatusTone {
  return isCommissionEventStatus(status) ? DESIGNER_STATUS_TONES[status] ?? "neutral" : "neutral";
}

// ---------------------------------------------------------------------------
// Draw schedule
// ---------------------------------------------------------------------------

export type DrawScheduleStatus = "active" | "scheduled" | "ended";

export type DrawScheduleRow = {
  id: string;
  startDate: string;
  endDate: string | null;
  /** Percentage points, e.g. 5 for the default 5-point reduction. */
  rateReductionPoints: number;
  status: DrawScheduleStatus;
  notes: string | null;
};

export function drawSchedule(
  periods: readonly EmployeeDrawPeriodRow[],
  drawRateReduction: number,
  today: string,
): DrawScheduleRow[] {
  const points = Math.round(toNumber(drawRateReduction) * 10000) / 100;

  return periods
    .slice()
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))
    .map<DrawScheduleRow>((period) => {
      const status: DrawScheduleStatus =
        period.effective_from > today
          ? "scheduled"
          : period.effective_to === null || period.effective_to >= today
            ? "active"
            : "ended";

      return {
        id: period.id,
        startDate: period.effective_from,
        endDate: period.effective_to,
        rateReductionPoints: points,
        status,
        notes: period.notes,
      };
    });
}

export function drawScheduleStatusLabel(status: DrawScheduleStatus) {
  return status === "active" ? "On draw" : status === "scheduled" ? "Scheduled" : "Ended";
}

// ---------------------------------------------------------------------------
// Ledgers, with the running balance the spec asks for
// ---------------------------------------------------------------------------

export type LedgerTransactionRow = {
  id: string;
  date: string;
  typeLabel: string;
  jobId: string | null;
  jobName: string | null;
  amount: number;
  /** The balance immediately after this entry, in chronological order. */
  balanceAfter: number;
  reason: string;
};

function withRunningBalance(
  rows: readonly { id: string; created_at: string; amount: number }[],
): Map<string, number> {
  const balances = new Map<string, number>();
  let running = 0;

  for (const row of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    running = roundMoney(running + toNumber(row.amount));
    balances.set(row.id, running);
  }

  return balances;
}

export function drawLedgerRows(
  rows: readonly EmployeeDrawLedgerRow[],
  jobNames: ReadonlyMap<string, string>,
): LedgerTransactionRow[] {
  const balances = withRunningBalance(rows);

  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({
      id: row.id,
      date: row.created_at,
      typeLabel: row.transaction_type.replaceAll("_", " "),
      jobId: row.job_id,
      jobName: row.job_id ? jobNames.get(row.job_id) ?? null : null,
      amount: roundMoney(toNumber(row.amount)),
      balanceAfter: balances.get(row.id) ?? 0,
      reason: row.reason,
    }));
}

export function rolloverLedgerRows(
  rows: readonly CommissionRolloverLedgerRow[],
  jobNames: ReadonlyMap<string, string>,
): LedgerTransactionRow[] {
  const balances = withRunningBalance(rows);

  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({
      id: row.id,
      date: row.created_at,
      typeLabel: row.transaction_type.replaceAll("_", " "),
      jobId: row.job_id,
      jobName: row.job_id ? jobNames.get(row.job_id) ?? null : null,
      amount: roundMoney(toNumber(row.amount)),
      balanceAfter: balances.get(row.id) ?? 0,
      reason: row.reason,
    }));
}

export type DrawTotals = {
  advances: number;
  commissionOffsets: number;
  repaymentsAndAdjustments: number;
  balance: number;
};

/** Draw money grouped the way an employee reads it. Balances stay derived. */
export function drawTotals(
  rows: readonly EmployeeDrawLedgerRow[],
): DrawTotals {
  let advances = 0;
  let commissionOffsets = 0;
  let repaymentsAndAdjustments = 0;

  for (const row of rows) {
    const amount = toNumber(row.amount);

    if (row.transaction_type === "draw_advance") advances += amount;
    else if (row.transaction_type === "commission_offset") commissionOffsets += amount;
    else repaymentsAndAdjustments += amount;
  }

  return {
    advances: roundMoney(advances),
    commissionOffsets: roundMoney(commissionOffsets),
    repaymentsAndAdjustments: roundMoney(repaymentsAndAdjustments),
    balance: roundMoney(advances + commissionOffsets + repaymentsAndAdjustments),
  };
}

// ---------------------------------------------------------------------------
// Commission pipeline
// ---------------------------------------------------------------------------

export type PipelineItem = {
  id: string;
  jobId: string;
  jobName: string;
  eventTypeLabel: string;
  statusLabel: string;
  statusTone: StatusTone;
  gpPercent: number;
  standardRate: number;
  effectiveRate: number;
  grossCommission: number;
  rolloverOffset: number;
  drawOffset: number;
  netPayable: number;
  date: string;
  auditState: FinalAuditState | null;
};

export type ActiveJobRow = {
  job: JobRow;
  projectedGrossCommission: number | null;
  depositTarget: number | null;
  commissionPaidToDate: number;
  estimatedRemaining: number | null;
  depositReceived: boolean;
  auditState: FinalAuditState;
};

export type CommissionPipeline = {
  active: ActiveJobRow[];
  pendingApproval: PipelineItem[];
  readyToPay: PipelineItem[];
  paid: PipelineItem[];
  finalTrueUps: PipelineItem[];
};

function pipelineItem(
  event: CommissionEventRow,
  jobNames: ReadonlyMap<string, string>,
  auditStates: ReadonlyMap<string, FinalAuditState>,
): PipelineItem {
  return {
    id: event.id,
    jobId: event.job_id,
    jobName: jobNames.get(event.job_id) ?? "Job",
    eventTypeLabel: isCommissionEventType(event.event_type)
      ? commissionEventTypeLabel(event.event_type)
      : event.event_type.replaceAll("_", " "),
    statusLabel: designerStatusLabel(event.status),
    statusTone: designerStatusTone(event.status),
    gpPercent: toNumber(event.commissionable_gp_percent),
    standardRate: toNumber(event.standard_commission_rate),
    effectiveRate: toNumber(event.effective_commission_rate),
    grossCommission: roundMoney(toNumber(event.gross_commission)),
    rolloverOffset: roundMoney(toNumber(event.rollover_offset)),
    drawOffset: roundMoney(toNumber(event.draw_offset)),
    netPayable: roundMoney(toNumber(event.net_payable)),
    date: event.paid_at ?? event.approved_at ?? event.created_at,
    auditState: auditStates.get(event.job_id) ?? null,
  };
}

/** The same pipeline item shape, for any list of events (e.g. recent activity). */
export function toPipelineItems({
  events,
  jobs,
  auditStates,
}: {
  events: readonly CommissionEventRow[];
  jobs: readonly JobRow[];
  auditStates: ReadonlyMap<string, FinalAuditState>;
}): PipelineItem[] {
  const jobNames = new Map(jobs.map((job) => [job.id, job.job_name]));

  return events.map((event) => pipelineItem(event, jobNames, auditStates));
}

export const HISTORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "deposit", label: "Deposit" },
  { id: "final_true_up", label: "Final true-up" },
  { id: "manual_adjustment", label: "Manual adjustment" },
  { id: "paid", label: "Paid" },
  { id: "voided", label: "Voided" },
] as const;

export type HistoryFilter = (typeof HISTORY_FILTERS)[number]["id"];

export function isHistoryFilter(value: unknown): value is HistoryFilter {
  return (
    typeof value === "string" &&
    HISTORY_FILTERS.some((filter) => filter.id === value)
  );
}

export function filterCommissionEvents(
  events: readonly CommissionEventRow[],
  filter: HistoryFilter,
): CommissionEventRow[] {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));

  switch (filter) {
    case "deposit":
    case "final_true_up":
    case "manual_adjustment":
      return sorted.filter((event) => event.event_type === filter);
    case "paid":
      return sorted.filter((event) => event.status === "paid");
    case "voided":
      return sorted.filter((event) => event.status === "voided");
    default:
      return sorted;
  }
}

/**
 * The pipeline groups, plus the contribution each one makes to the headline
 * metrics, all from the events the designer can already see.
 */
export function buildCommissionPipeline({
  summary,
  jobs,
  projections,
  auditStates,
}: {
  summary: EmployeeCommissionSummary;
  jobs: readonly JobRow[];
  /** Projected commission per job id, from the canonical engine. */
  projections: ReadonlyMap<string, { grossCommission: number; depositTarget: number } | null>;
  auditStates: ReadonlyMap<string, FinalAuditState>;
}): CommissionPipeline {
  const jobNames = new Map(jobs.map((job) => [job.id, job.job_name]));
  const events = summary.events;

  const active = jobs
    .filter((job) => job.status !== "cancelled")
    .map<ActiveJobRow>((job) => {
      const projection = projections.get(job.id) ?? null;
      const paidToDate = events
        .filter((event) => event.job_id === job.id && event.status === "paid")
        .reduce((total, event) => total + toNumber(event.net_payable), 0);
      const recognized = events
        .filter(
          (event) =>
            event.job_id === job.id &&
            event.status !== "voided" &&
            event.event_type !== "final_true_up",
        )
        .reduce((total, event) => total + toNumber(event.net_payable), 0);

      return {
        job,
        projectedGrossCommission: projection ? projection.grossCommission : null,
        depositTarget: projection ? projection.depositTarget : null,
        commissionPaidToDate: roundMoney(paidToDate),
        estimatedRemaining: projection
          ? roundMoney(projection.grossCommission - recognized)
          : null,
        depositReceived: job.deposit_received_date !== null,
        auditState: auditStates.get(job.id) ?? "not_started",
      };
    })
    .sort((a, b) => b.job.created_at.localeCompare(a.job.created_at));

  return {
    active,
    pendingApproval: events
      .filter((event) => event.status === "pending_approval")
      .map((event) => pipelineItem(event, jobNames, auditStates)),
    readyToPay: events
      .filter((event) => event.status === "approved")
      .map((event) => pipelineItem(event, jobNames, auditStates)),
    paid: events
      .filter((event) => event.status === "paid")
      .map((event) => pipelineItem(event, jobNames, auditStates)),
    finalTrueUps: events
      .filter((event) => event.event_type === "final_true_up")
      .map((event) => pipelineItem(event, jobNames, auditStates)),
  };
}
