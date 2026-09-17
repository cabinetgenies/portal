"use client";

import { useActionState } from "react";

import { JobAdjustmentForm } from "@/components/commission/job-adjustment-form";
import { ActionButtonForm } from "@/components/ui/action-button-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormAlert, SubmitButton } from "@/components/ui/form";
import { InfoIcon } from "@/components/icons";
import {
  beginCommissionAudit,
  cancelCommissionAudit,
  finalizeCommissionAudit,
  reopenCommissionAudit,
} from "@/lib/commission/audit-actions";
import {
  FINAL_AUDIT_STATE_LABELS,
  FINAL_TRUE_UP_OUTCOME_LABELS,
  finalTrueUpOutcome,
  type FinalAuditState,
} from "@/lib/commission/audit";
import { changeOrderLabel } from "@/lib/commission/change-orders";
import type { LiveCalculation } from "@/lib/commission/live-calculation";
import { ADJUSTMENT_TYPE_LABELS, isAdjustmentType } from "@/lib/commission/types";
import type {
  CommissionAuditRow,
  JobChangeOrderRow,
  JobFinancialAdjustmentRow,
} from "@/lib/supabase/database.types";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/utils/format";

type AuditView = {
  originalContractPrice: number;
  changeOrderRevenue: number;
  originalCost: number;
  changeOrderCost: number;
  directJobCost: number;
  burdenPercent: number;
  burdenCost: number;
  warrantyContingencyPercent: number;
  warrantyServiceContingency: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossProfitPercent: number;
  tierLabel: string | null;
  effectiveCommissionRate: number;
  standardCommissionRate: number;
  drawRateReduction: number;
  finalGrossCommission: number;
  previouslyRecognized: number;
  finalTrueUp: number;
};

function viewFromAudit(audit: CommissionAuditRow): AuditView {
  return {
    originalContractPrice: audit.original_contract_price,
    changeOrderRevenue: audit.change_order_revenue,
    originalCost: audit.original_cost,
    changeOrderCost: audit.change_order_cost,
    directJobCost: audit.direct_job_cost,
    burdenPercent: audit.burden_percent,
    burdenCost: audit.burden_cost,
    warrantyContingencyPercent: audit.warranty_contingency_percent,
    warrantyServiceContingency: audit.warranty_service_contingency,
    totalRevenue: audit.final_total_revenue,
    totalCost: audit.final_total_cost,
    grossProfit: audit.final_gross_profit,
    grossProfitPercent: audit.final_gp_percent,
    tierLabel: audit.tier_label,
    effectiveCommissionRate: audit.effective_commission_rate,
    standardCommissionRate: audit.standard_commission_rate,
    drawRateReduction: audit.draw_rate_reduction,
    finalGrossCommission: audit.final_gross_commission,
    previouslyRecognized: audit.previously_recognized,
    finalTrueUp: audit.final_true_up,
  };
}

function viewFromLive(calculation: LiveCalculation): AuditView {
  return {
    originalContractPrice: calculation.revenue.originalContractPrice,
    changeOrderRevenue: calculation.revenue.changeOrderRevenue,
    originalCost: calculation.cost.originalCost,
    changeOrderCost: calculation.cost.changeOrderCost,
    directJobCost: calculation.cost.directJobCost,
    burdenPercent: calculation.cost.burdenPercent,
    burdenCost: calculation.cost.burdenCost,
    warrantyContingencyPercent: calculation.cost.warrantyContingencyPercent,
    warrantyServiceContingency: calculation.cost.warrantyServiceContingency,
    totalRevenue: calculation.revenue.totalRevenue,
    totalCost: calculation.cost.totalCost,
    grossProfit: calculation.profit.grossProfit,
    grossProfitPercent: calculation.profit.grossProfitPercent,
    tierLabel: calculation.commission.tierLabel,
    effectiveCommissionRate: calculation.commission.effectiveRate,
    standardCommissionRate: calculation.commission.standardRate,
    drawRateReduction: calculation.commission.drawReduction,
    finalGrossCommission: calculation.commission.projectedGrossCommission,
    previouslyRecognized: calculation.commission.previouslyRecognized,
    finalTrueUp: calculation.commission.estimatedRemaining,
  };
}

export function FinalAuditPanel({
  jobId,
  state,
  audits,
  openAudit,
  latestFinalized,
  calculation,
  changeOrders,
  adjustments,
  blockers,
  canManageAudit,
  trueUp,
}: {
  jobId: string;
  state: FinalAuditState;
  audits: CommissionAuditRow[];
  openAudit: CommissionAuditRow | null;
  latestFinalized: CommissionAuditRow | null;
  calculation: LiveCalculation;
  changeOrders: JobChangeOrderRow[];
  adjustments: JobFinancialAdjustmentRow[];
  blockers: readonly string[];
  canManageAudit: boolean;
  trueUp: { status: string; netPayable: number } | null;
}) {
  const showingFinalized = !openAudit && latestFinalized !== null;
  const view = openAudit
    ? viewFromLive(calculation)
    : latestFinalized
      ? viewFromAudit(latestFinalized)
      : null;
  const outcome = view ? finalTrueUpOutcome(view.finalTrueUp) : null;
  const activeChangeOrders = changeOrders.filter((changeOrder) => changeOrder.active);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          label={FINAL_AUDIT_STATE_LABELS[state]}
          tone={
            state === "settled"
              ? "positive"
              : state === "true_up_created"
                ? "info"
                : state === "in_review"
                  ? "warning"
                  : "neutral"
          }
        />
        {latestFinalized ? (
          <span className="text-xs text-ink-muted">
            Latest finalized revision {latestFinalized.revision}
            {latestFinalized.finalized_at
              ? ` · ${formatDateTime(latestFinalized.finalized_at)}`
              : null}
          </span>
        ) : null}
        {openAudit ? (
          <span className="text-xs text-ink-muted">
            Revision {openAudit.revision} open since {formatDateTime(openAudit.started_at)}
          </span>
        ) : null}
      </div>

      {state === "not_started" ? (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-ink-muted">
            Begin the audit when the project is financially complete. You will review the
            final revenue and costs, record any commission-specific corrections, then lock a
            final snapshot before the true-up is created.
          </p>
          {canManageAudit ? (
            <ActionButtonForm
              action={beginCommissionAudit}
              fields={{ jobId }}
              label="Begin final commission audit"
              pendingLabel="Opening…"
            />
          ) : (
            <p className="text-xs leading-5 text-ink-subtle">
              Accounting, administrators and the CEO can run the audit.
            </p>
          )}
        </div>
      ) : null}

      {view ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-line bg-surface-muted/45 p-4">
            <p className="text-sm font-semibold text-ink">
              {showingFinalized
                ? `Finalized audit · revision ${latestFinalized?.revision}`
                : `Audit review · revision ${openAudit?.revision}`}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              {showingFinalized
                ? "These figures are locked to this finalized audit revision."
                : "The figures below update as you record audit adjustments. Finalize only after the ending financials are correct."}
            </p>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <AuditMetric label="Final revenue" value={formatMoney(view.totalRevenue)} />
            <AuditMetric label="Final costs" value={formatMoney(view.totalCost)} />
            <AuditMetric label="Final gross profit" value={formatMoney(view.grossProfit)} />
            <AuditMetric label="Final GP %" value={formatPercent(view.grossProfitPercent)} />
          </section>

          {openAudit ? (
            <section className="space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Audit adjustments</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-muted">
                  Record final corrections or commission exclusions here. Adjustments are
                  append-only and immediately recalculate the audited revenue, costs, GP,
                  commission tier, and final true-up shown on this page.
                </p>
              </div>

              {adjustments.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="divide-y divide-line">
                    {adjustments.map((adjustment) => (
                      <div
                        key={adjustment.id}
                        className="grid gap-1 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {isAdjustmentType(adjustment.adjustment_type)
                              ? ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type]
                              : adjustment.adjustment_type.replaceAll("_", " ")}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-muted">{adjustment.reason}</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-ink">
                          {formatMoney(adjustment.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-sm text-ink-muted">
                  No audit adjustments recorded.
                </p>
              )}

              {canManageAudit ? <JobAdjustmentForm jobId={jobId} /> : null}
            </section>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink">Revenue & change orders</h3>
              <dl className="divide-y divide-line">
                <DetailRow label="Original contract" value={formatMoney(view.originalContractPrice)} />
                <DetailRow label="Change order revenue" value={formatMoney(view.changeOrderRevenue)} />
                <DetailRow label="Final total revenue" value={formatMoney(view.totalRevenue)} strong />
              </dl>

              {activeChangeOrders.length > 0 ? (
                <div className="border-t border-line pt-3">
                  <p className="mb-2 text-xs font-medium text-ink-subtle">Change orders</p>
                  <ul className="space-y-2">
                    {activeChangeOrders.map((changeOrder) => (
                      <li key={changeOrder.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-ink-muted">{changeOrderLabel(changeOrder)}</span>
                        <span className="shrink-0 tabular-nums text-ink">
                          {formatMoney(changeOrder.revenue)} / {formatMoney(changeOrder.cost)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink">Cost & commission result</h3>
              <dl className="divide-y divide-line">
                <DetailRow label="Original costs" value={formatMoney(view.originalCost)} />
                <DetailRow label="Change order costs" value={formatMoney(view.changeOrderCost)} />
                <DetailRow label="Burden" value={formatMoney(view.burdenCost)} />
                <DetailRow label="Warranty / service" value={formatMoney(view.warrantyServiceContingency)} />
                <DetailRow label="Final total cost" value={formatMoney(view.totalCost)} strong />
                <DetailRow label="Applicable tier" value={view.tierLabel ?? "No matching tier"} />
                <DetailRow label="Effective rate" value={formatPercent(view.effectiveCommissionRate)} />
                <DetailRow label="Final gross commission" value={formatMoney(view.finalGrossCommission)} strong />
                <DetailRow label="Previously recognized" value={formatMoney(view.previouslyRecognized)} />
                <DetailRow
                  label={outcome ? `Final true-up · ${FINAL_TRUE_UP_OUTCOME_LABELS[outcome]}` : "Final true-up"}
                  value={formatMoney(view.finalTrueUp)}
                  strong
                />
              </dl>
            </section>
          </div>

          {openAudit ? (
            <div className="space-y-4 border-t border-line pt-5">
              {blockers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">Before this audit can be finalized:</p>
                  <ul className="space-y-1.5">
                    {blockers.map((blocker) => (
                      <li key={blocker} className="flex items-start gap-2 text-sm leading-6 text-ink-muted">
                        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-line bg-accent-soft px-3 py-3 text-sm text-accent-strong">
                  Audit is ready to finalize. Finalizing locks the figures above as the authoritative commission snapshot.
                </div>
              )}

              {canManageAudit ? (
                <div className="flex flex-wrap items-start gap-3">
                  <FinalizeForm jobId={jobId} auditId={openAudit.id} disabled={blockers.length > 0} />
                  <ActionButtonForm
                    action={cancelCommissionAudit}
                    fields={{ jobId, auditId: openAudit.id }}
                    label="Cancel audit"
                    pendingLabel="Cancelling…"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {showingFinalized && latestFinalized ? (
            <div className="space-y-3 border-t border-line pt-4">
              <p className="text-sm leading-6 text-ink-muted">
                {trueUp && trueUp.status !== "voided"
                  ? `The final true-up for this audit exists (${trueUp.status.replace("_", " ")}, ${formatMoney(trueUp.netPayable)} net). Approve and pay it through the Commission section.`
                  : "Create the final true-up from the Commission section. It will use this finalized snapshot rather than the live estimate."}
              </p>
              {canManageAudit ? (
                <div className="flex flex-wrap items-start gap-3">
                  <ActionButtonForm
                    action={reopenCommissionAudit}
                    fields={{ jobId }}
                    label="Re-open audit as a new revision"
                    pendingLabel="Re-opening…"
                  />
                  <p className="max-w-xl text-xs leading-5 text-ink-subtle">
                    Re-opening keeps this revision as history and starts the next revision in review. It is only possible while no final true-up exists.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {audits.length > 0 ? (
        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-xs font-semibold tracking-[0.08em] text-ink-subtle uppercase">Audit history</h3>
          <ul className="space-y-1 text-xs text-ink-muted">
            {audits.map((audit) => (
              <li key={audit.id}>
                Revision {audit.revision} · {audit.status.replace("_", " ")} · started {formatDateTime(audit.started_at)}
                {audit.finalized_at
                  ? ` · finalized ${formatDateTime(audit.finalized_at)} at ${formatMoney(audit.final_true_up)} true-up`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FinalizeForm({
  jobId,
  auditId,
  disabled,
}: {
  jobId: string;
  auditId: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(finalizeCommissionAudit, undefined);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="auditId" value={auditId} />
      {disabled ? (
        <Button type="button" disabled variant="secondary">Finalize audit</Button>
      ) : (
        <SubmitButton label="Finalize audit" pendingLabel="Finalizing…" />
      )}
      <FormAlert state={state} className="max-w-xl" />
    </form>
  );
}

function AuditMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</p>
      <p className="mt-2 text-lg font-semibold tabular-nums tracking-tight text-ink">{value}</p>
    </div>
  );
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className={strong ? "text-sm font-semibold text-ink" : "text-sm text-ink-muted"}>{label}</dt>
      <dd className={strong ? "text-sm font-semibold tabular-nums text-ink" : "text-sm tabular-nums text-ink"}>{value}</dd>
    </div>
  );
}
