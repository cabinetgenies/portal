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
    <Panel
      title="History"
      description="Financial adjustments and the project audit trail. These records explain what changed and when without cluttering the main project overview."
    >
      <div className="space-y-6">
        {canAdjust ? <JobAdjustmentForm jobId={job.id} /> : null}

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Financial adjustments
          </h3>
          {adjustments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
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
                        {isAdjustmentType(adjustment.adjustment_type)
                          ? ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]
                          : adjustment.adjustment_type}
                      </Td>
                      <TdNumeric>{formatMoney(adjustment.amount)}</TdNumeric>
                      <Td className="text-ink-muted">{adjustment.reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Audit trail
          </h3>
          {auditEvents.length === 0 ? (
            <EmptyState
              icon={<ActivityIcon className="h-5 w-5" />}
              title="No audit events recorded yet"
              description="Status, designer, plan and financial edits are logged automatically."
            />
          ) : (
            <ul className="space-y-2">
              {auditEvents.map((event) => (
                <li key={event.id} className="rounded-lg border border-line bg-surface-muted px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{auditActionLabel(event.action)}</span>
                    <span className="text-xs text-ink-subtle">{formatDateTime(event.created_at)}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs break-all text-ink-muted">
                    {JSON.stringify(event.metadata)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}

function auditActionLabel(action: string) {
  switch (action) {
    case "job_created":
      return "Job created";
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
