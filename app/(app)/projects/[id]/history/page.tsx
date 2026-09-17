import Link from "next/link";
import { notFound } from "next/navigation";

import { JobAdjustmentForm } from "@/components/commission/job-adjustment-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { buttonClassName } from "@/components/ui/button";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { getJobDetail } from "@/lib/commission/queries";
import { ADJUSTMENT_TYPE_LABELS, isAdjustmentType } from "@/lib/commission/types";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata = { title: "Project history" };

export default async function ProjectHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ adjust?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">Project history</h2>
          <p className="mt-1 text-sm text-ink-muted">A chronological record of project changes and financial adjustments.</p>
        </div>
        {canAdjust ? (
          <Link
            href={`${PROJECT_ROUTES.history(id)}?adjust=1`}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Record adjustment
          </Link>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Audit events" value={String(auditEvents.length)} />
        <Metric label="Financial adjustments" value={String(adjustments.length)} />
        <Metric label="Latest activity" value={auditEvents[0] ? formatDateTime(auditEvents[0].created_at) : "No activity yet"} compact />
      </section>

      <Panel
        title="Activity timeline"
        description="Newest activity first, written as a readable project timeline."
      >
        {auditEvents.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon className="h-5 w-5" />}
            title="No audit events recorded yet"
            description="Status, designer, plan, and financial edits are logged automatically."
          />
        ) : (
          <ol className="relative space-y-0 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-px before:bg-line">
            {auditEvents.map((event) => {
              const category = eventCategory(event.action);
              const metadata = auditMetadataSummary(event.metadata);

              return (
                <li key={event.id} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
                  <div className={`relative z-10 mt-1 h-6 w-6 rounded-full border-4 border-surface ${category.dotClass}`} />
                  <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-ink">{auditActionLabel(event.action)}</p>
                        {metadata ? <p className="mt-1 text-xs leading-5 text-ink-muted">{metadata}</p> : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${category.badgeClass}`}>{category.label}</span>
                        <span className="text-xs text-ink-subtle">{formatDateTime(event.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel title="Financial adjustments" description="Manual corrections and exclusions retained for auditability.">
        {adjustments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">No financial adjustments recorded.</p>
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

      {canAdjust && query.adjust === "1" ? (
        <Panel
          title="Record financial adjustment"
          description="Adjustments are append-only so the project keeps a clear history."
          actions={
            <Link href={PROJECT_ROUTES.history(id)} className={buttonClassName({ variant: "secondary", size: "sm" })}>
              Cancel
            </Link>
          }
        >
          <JobAdjustmentForm jobId={job.id} />
        </Panel>
      ) : null}
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</p>
      <p className={`mt-2 font-semibold text-ink ${compact ? "text-sm" : "font-mono text-xl tabular-nums"}`}>{value}</p>
    </div>
  );
}

function auditMetadataSummary(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const entries = Object.entries(metadata as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);
  return entries.length > 0 ? entries.join(" · ") : null;
}

function eventCategory(action: string) {
  if (action.includes("commission") || action.includes("compensation")) {
    return { label: "Commission", dotClass: "bg-accent", badgeClass: "bg-accent-soft text-accent-strong" };
  }
  if (action.includes("financial") || action.includes("adjustment")) {
    return { label: "Financial", dotClass: "bg-ink-muted", badgeClass: "bg-surface-muted text-ink-muted" };
  }
  return { label: "Project", dotClass: "bg-ink-subtle", badgeClass: "bg-surface-muted text-ink-muted" };
}

function auditActionLabel(action: string) {
  switch (action) {
    case "job_created": return "Project created";
    case "job_status_changed": return "Status changed";
    case "sales_designer_changed": return "Sales designer changed";
    case "compensation_plan_assigned": return "Compensation plan assigned";
    case "commission_plan_assigned": return "Commission plan assigned";
    case "job_financials_changed": return "Financials updated";
    case "financial_adjustment_created": return "Financial adjustment recorded";
    default: return action.replaceAll("_", " ");
  }
}
