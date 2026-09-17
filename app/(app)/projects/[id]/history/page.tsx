import { notFound } from "next/navigation";

import { JobAdjustmentForm } from "@/components/commission/job-adjustment-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { getJobDetail } from "@/lib/commission/queries";
import { ADJUSTMENT_TYPE_LABELS, isAdjustmentType } from "@/lib/commission/types";
import { formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata = { title: "Project history" };

export default async function ProjectHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const detail = await getJobDetail(id);
  if (!detail) notFound();

  const { job, adjustments, auditEvents } = detail;
  const canAdjust = session.capabilities.includes("create:job-adjustments");
  const canViewConfig = session.capabilities.includes("view:compensation-config");

  if (!canViewConfig) {
    return (
      <EmptyState
        title="Project history is restricted"
        description="Your role does not have access to financial adjustments or the project audit trail."
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Adjustments" value={String(adjustments.length)} />
        <Metric label="Audit events" value={String(auditEvents.length)} />
        <Metric
          label="Latest activity"
          value={auditEvents[0] ? formatDateTime(auditEvents[0].created_at) : "No activity yet"}
          compact
        />
      </section>

      {canAdjust ? (
        <Panel
          title="Record financial adjustment"
          description="Adjustments are append-only so the project keeps a clear financial history."
        >
          <JobAdjustmentForm jobId={job.id} />
        </Panel>
      ) : null}

      <Panel
        title="Financial adjustments"
        description="Manual financial corrections and exclusions recorded against this project."
      >
        {adjustments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong bg-surface-muted/30 px-4 py-8 text-center text-sm text-ink-muted">
            No financial adjustments recorded.
          </p>
        ) : (
          <TableWrap>
            <Table caption="Financial adjustments recorded against this project">
              <thead>
                <tr>
                  <Th>Recorded</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((adjustment) => (
                  <tr key={adjustment.id}>
                    <Td className="text-ink-muted">{formatDateTime(adjustment.created_at)}</Td>
                    <Td>
                      <span className="inline-flex rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink">
                        {isAdjustmentType(adjustment.adjustment_type)
                          ? ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]
                          : adjustment.adjustment_type}
                      </span>
                    </Td>
                    <TdNumeric>{formatMoney(adjustment.amount)}</TdNumeric>
                    <Td className="max-w-xl text-ink-muted">{adjustment.reason}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <Panel
        title="Audit trail"
        description="Automatic project changes in chronological order. The newest activity appears first."
      >
        {auditEvents.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon className="h-5 w-5" />}
            title="No audit events recorded yet"
            description="Status, designer, plan and financial edits are logged automatically."
          />
        ) : (
          <ol className="relative space-y-0 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-px before:bg-line">
            {auditEvents.map((event) => {
              const metadata = auditMetadataSummary(event.metadata);

              return (
                <li key={event.id} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
                  <div className="relative z-10 mt-1 h-6 w-6 rounded-full border-4 border-surface bg-accent" />
                  <div className="rounded-xl border border-line bg-surface-muted/35 px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-semibold text-ink">{auditActionLabel(event.action)}</span>
                      <span className="text-xs text-ink-subtle">{formatDateTime(event.created_at)}</span>
                    </div>
                    {metadata ? (
                      <p className="mt-2 text-xs leading-5 text-ink-muted">{metadata}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-[0.1em] text-ink-subtle uppercase">{label}</p>
      <p className={`mt-2 font-semibold text-ink ${compact ? "text-sm" : "font-mono text-xl tabular-nums"}`}>{value}</p>
    </div>
  );
}

function auditMetadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;

  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);

  return entries.length > 0 ? entries.join(" · ") : null;
}

function auditActionLabel(action: string) {
  switch (action) {
    case "job_created":
      return "Project created";
    case "job_status_changed":
      return "Status changed";
    case "sales_designer_changed":
      return "Sales designer changed";
    case "compensation_plan_assigned":
      return "Compensation plan assigned";
    case "commission_plan_assigned":
      return "Commission plan assigned";
    case "job_financials_changed":
      return "Financials changed";
    case "financial_adjustment_created":
      return "Financial adjustment recorded";
    default:
      return action.replaceAll("_", " ");
  }
}
