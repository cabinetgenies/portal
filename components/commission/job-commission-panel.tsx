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
import { formatDateTime, formatMoney, formatPercent } from "@/lib/utils/format";

/**
 * The job's commission section.
 *
 * Live projections need the plan version's tiers, so they are shown to the roles
 * that can read compensation configuration. Everyone who can see the job sees the
 * commission *events*, because each event snapshots its own rates and amounts.
 */
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
  /** A final true-up is measured against a finalized audit, never a GP audit date. */
  hasFinalizedAudit: boolean;
}) {
  const { detail, projected, finalCalculation, events } = context;
  const paidToDate = events
    .filter((event) => event.status === "paid")
    .reduce((total, event) => total + toNumber(event.net_payable), 0);

  return (
    <Panel
      id="commission"
      title="Commission"
      description="Calculated from commissionable gross profit after burden, using the plan version attached to this job. Every event snapshots the rates and figures it used."
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
              disabled={
                !context.finalEligible || context.hasFinalEvent || !hasFinalizedAudit
              }
              label={
                context.hasFinalEvent
                  ? "Final true-up exists"
                  : hasFinalizedAudit
                    ? "Calculate final true-up"
                    : "Finalize the audit first"
              }
            />
          </>
        ) : null
      }
    >
      <div className="space-y-6">
        {context.missingPlanVersion ? (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-2.5">
            <AlertIcon className="mt-0.5 h-4 w-4 text-accent-strong" />
            <p className="text-sm leading-6 text-accent-strong">
              This job has no compensation plan version attached, so commission cannot be
              calculated yet. An administrator attaches the version that was effective on
              the sold date from the Commission setup section above.
            </p>
          </div>
        ) : null}

        {!context.depositEligible && !context.hasDepositEvent ? (
          <p className="text-sm leading-6 text-ink-muted">
            The deposit commission becomes eligible once the deposit received date is
            recorded on the job.
          </p>
        ) : null}

        {canViewConfig && projected ? (
          <section aria-labelledby="projected-commission-heading" className="space-y-3">
            <h3
              id="projected-commission-heading"
              className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase"
            >
              Projected commission
            </h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Figure label="Sales designer" value={designerName(context)} />
              <Figure label="Compensation plan" value={detail.plan?.name ?? "—"} />
              <Figure
                label="Plan version"
                value={detail.planVersion?.version_name ?? "—"}
              />
              <Figure
                label="Commissionable GP"
                value={formatMoney(toNumber(detail.job.commissionable_gross_profit))}
              />
              <Figure
                label="Commissionable GP %"
                value={formatPercent(toNumber(detail.job.commissionable_gp_percent))}
              />
              <Figure label="Applicable tier" value={projected.tier?.label ?? "No matching tier"} />
              <Figure label="Standard rate" value={formatPercent(projected.standardRate)} />
              <Figure
                label="Draw rate reduction"
                value={
                  projected.drawReductionApplied > 0
                    ? `− ${formatPercent(projected.drawReductionApplied)}`
                    : "Not on draw"
                }
              />
              <Figure label="Effective rate" value={formatPercent(projected.effectiveRate)} />
              <Figure
                label="Projected gross commission"
                value={formatMoney(projected.jobGrossCommission)}
              />
              <Figure
                label="Deposit target"
                value={`${formatMoney(projected.grossCommission)} (${formatPercent(
                  projected.depositPayoutPercent,
                  0,
                )})`}
              />
              <Figure label="Commission paid to date" value={formatMoney(paidToDate)} />
              <Figure
                label="Outstanding rollover"
                value={formatMoney(context.rolloverBalance)}
              />
              <Figure label="Outstanding draw" value={formatMoney(context.drawBalance)} />
              <Figure
                label="Estimated cash payable at deposit"
                value={formatMoney(projected.netPayable)}
              />
            </dl>

            {projected.warnings.length > 0 ? (
              <ul className="space-y-1 text-xs leading-5 text-accent-strong">
                {projected.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {canViewConfig && finalCalculation && (context.finalEligible || context.hasFinalEvent) ? (
          <section aria-labelledby="final-commission-heading" className="space-y-3">
            <h3
              id="final-commission-heading"
              className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase"
            >
              Final audited commission
            </h3>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Figure
                label="Final gross commission"
                value={formatMoney(finalCalculation.jobGrossCommission)}
              />
              <Figure
                label="Already recognized"
                value={formatMoney(finalCalculation.previouslyRecognized)}
              />
              <Figure
                label="Final true-up"
                value={formatMoney(finalCalculation.grossCommission)}
              />
              <Figure
                label="Rollover created"
                value={formatMoney(finalCalculation.rolloverObligation)}
              />
              <Figure
                label="Rollover applied"
                value={formatMoney(finalCalculation.rolloverOffset)}
              />
              <Figure label="Draw applied" value={formatMoney(finalCalculation.drawOffset)} />
              <Figure
                label="Final cash payable"
                value={formatMoney(finalCalculation.netPayable)}
              />
            </dl>
          </section>
        ) : null}

        <section aria-labelledby="commission-events-heading" className="space-y-3">
          <h3
            id="commission-events-heading"
            className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase"
          >
            Commission events
          </h3>

          {events.length === 0 ? (
            <EmptyState
              icon={<CommissionsIcon className="h-5 w-5" />}
              title="No commission events yet."
              description={
                context.depositEligible
                  ? "The deposit is recorded, so the deposit commission can be calculated."
                  : "Events appear here once the deposit is recorded and commission is calculated."
              }
            />
          ) : (
            <TableWrap>
              <Table caption="Commission events for this job">
                <thead>
                  <tr>
                    <Th>Created</Th>
                    <Th>Type</Th>
                    <Th>Stage</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Gross</Th>
                    <Th className="text-right">Rollover</Th>
                    <Th className="text-right">Draw</Th>
                    <Th className="text-right">Net payable</Th>
                    <Th>Workflow</Th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <Td className="text-ink-muted">{formatDateTime(event.created_at)}</Td>
                      <Td>{commissionEventTypeLabel(event.event_type)}</Td>
                      <Td className="text-ink-muted">{event.calculation_stage}</Td>
                      <Td>
                        <StatusBadge
                          label={commissionEventStatusLabel(event.status)}
                          tone={commissionEventStatusTone(event.status)}
                        />
                      </Td>
                      <TdNumeric>{formatMoney(toNumber(event.gross_commission))}</TdNumeric>
                      <TdNumeric>{formatMoney(toNumber(event.rollover_offset))}</TdNumeric>
                      <TdNumeric>{formatMoney(toNumber(event.draw_offset))}</TdNumeric>
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
        </section>
      </div>
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

function designerName(context: JobCommissionContext) {
  const designer = context.detail.designer;

  if (!designer) return "—";

  const combined = [designer.first_name, designer.last_name].filter(Boolean).join(" ");

  return combined || designer.display_name || designer.email || "—";
}
