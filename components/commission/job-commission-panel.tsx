import {
  CommissionEventWorkflowActions,
  CreateDepositCommissionButton,
  CreateFinalTrueUpButton,
} from "@/components/commission/commission-actions";
import { EmptyState } from "@/components/empty-state/empty-state";
import { AlertIcon, CommissionsIcon } from "@/components/icons";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import type { JobCommissionContext } from "@/lib/commission/event-queries";
import {
  commissionEventStatusLabel,
  commissionEventStatusTone,
  commissionEventTypeLabel,
} from "@/lib/commission/types";
import { toNumber } from "@/lib/commission/financials";
import { formatDateTime, formatMoney } from "@/lib/utils/format";

export function JobCommissionPanel({
  context,
  canCalculate,
  canViewConfig,
  canSubmit,
  canApprove,
  canPay,
  canVoid,
  hasFinalizedAudit,
}: {
  context: JobCommissionContext;
  canCalculate: boolean;
  canViewConfig: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canPay: boolean;
  canVoid: boolean;
  hasFinalizedAudit: boolean;
}) {
  const { detail, projected, events } = context;
  const paidToDate = events
    .filter((event) => event.status === "paid")
    .reduce((total, event) => total + toNumber(event.net_payable), 0);

  return (
    <Panel
      id="commission"
      title="Commission events"
      description="Calculated and approved payouts for this project."
      actions={
        canCalculate && !context.missingPlanVersion ? (
          <>
            <CreateDepositCommissionButton
              jobId={detail.job.id}
              disabled={!context.depositEligible || context.hasDepositEvent}
              label={context.hasDepositEvent ? "Deposit event exists" : "Calculate deposit"}
            />
            <CreateFinalTrueUpButton
              jobId={detail.job.id}
              disabled={!context.finalEligible || context.hasFinalEvent || !hasFinalizedAudit}
              label={
                context.hasFinalEvent
                  ? "Final true-up exists"
                  : hasFinalizedAudit
                    ? "Calculate final true-up"
                    : "Finalize audit first"
              }
            />
          </>
        ) : null
      }
    >
      <div className="space-y-4">
        {context.missingPlanVersion ? (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-2.5">
            <AlertIcon className="mt-0.5 h-4 w-4 text-accent-strong" />
            <p className="text-sm leading-6 text-accent-strong">
              Attach the compensation plan version that covered the sold date before calculating commission.
            </p>
          </div>
        ) : null}

        {!context.depositEligible && !context.hasDepositEvent ? (
          <p className="text-sm leading-6 text-ink-muted">
            Deposit commission becomes available after the deposit received date is recorded.
          </p>
        ) : null}

        {canViewConfig && projected ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="Deposit target" value={formatMoney(projected.grossCommission)} />
            <MiniStat label="Paid to date" value={formatMoney(paidToDate)} />
            <MiniStat label="Estimated deposit cash" value={formatMoney(projected.netPayable)} />
          </div>
        ) : null}

        {events.length === 0 ? (
          <EmptyState
            icon={<CommissionsIcon className="h-5 w-5" />}
            title="No commission events yet"
            description={
              context.depositEligible
                ? "The deposit is recorded, so the deposit commission can be calculated."
                : "Events will appear here after commission is calculated."
            }
          />
        ) : (
          <TableWrap>
            <Table caption="Commission events for this job">
              <thead>
                <tr>
                  <Th>Created</Th>
                  <Th>Event</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Net payable</Th>
                  <Th>Workflow</Th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <Td className="text-ink-muted">{formatDateTime(event.created_at)}</Td>
                    <Td>{commissionEventTypeLabel(event.event_type)}</Td>
                    <Td>
                      <StatusBadge
                        label={commissionEventStatusLabel(event.status)}
                        tone={commissionEventStatusTone(event.status)}
                      />
                    </Td>
                    <TdNumeric>{formatMoney(toNumber(event.net_payable))}</TdNumeric>
                    <Td>
                      <CommissionEventWorkflowActions
                        eventId={event.id}
                        status={event.status}
                        canSubmit={canSubmit}
                        canApprove={canApprove}
                        canPay={canPay}
                        canVoid={canVoid}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </Panel>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted/40 px-3.5 py-3">
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
