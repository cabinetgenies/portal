"use client";

import { useActionState } from "react";

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
import type {
  CommissionAuditRow,
  JobChangeOrderRow,
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
            This job has not been audited. The figures everywhere else on this page are the
            live estimate — commission already recognized is based on them. The final audit
            is the authoritative record, and it is a deliberate step: start it here, review
            the complete picture, correct anything that is wrong, then finalize.
          </p>
          {canManageAudit ? (
            <ActionButtonForm
              action={beginCommissionAudit}
              fields={{ jobId }}
              label="Begin Final Commission Audit"
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
        <div className="space-y-5">
          <div className="rounded-lg border border-line bg-surface-muted p-4">
            <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              {showingFinalized
                ? `Finalized audit · revision ${latestFinalized?.revision}`
                : `Audit review · revision ${openAudit?.revision} (live figures)`}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-subtle">
              {showingFinalized
                ? "These are the figures that were audited and locked. Editing the job's financials later does not change them — the difference is recognized through the final true-up."
                : "These are the job's current figures. Correct anything wrong in Financials or Change orders above; this review updates with them."}
            </p>
          </div>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Original job
            </h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="Original contract price" value={formatMoney(view.originalContractPrice)} />
              <Figure label="Original costs" value={formatMoney(view.originalCost)} />
              <Figure
                label="Change order revenue"
                value={formatMoney(view.changeOrderRevenue)}
              />
              <Figure label="Change order costs" value={formatMoney(view.changeOrderCost)} />
            </dl>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Change orders
            </h3>
            {activeChangeOrders.length === 0 ? (
              <p className="text-sm text-ink-muted">No active change orders.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {activeChangeOrders.map((changeOrder) => (
                  <li
                    key={changeOrder.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span className="text-ink">{changeOrderLabel(changeOrder)}</span>
                    <span className="font-mono text-xs tabular-nums text-ink-muted">
                      revenue {formatMoney(changeOrder.revenue)} · cost{" "}
                      {formatMoney(changeOrder.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Cost
            </h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="Direct job cost" value={formatMoney(view.directJobCost)} />
              <Figure
                label={`Burden (${formatPercent(view.burdenPercent, 2)})`}
                value={formatMoney(view.burdenCost)}
              />
              <Figure
                label={`Warranty contingency (${formatPercent(
                  view.warrantyContingencyPercent,
                  2,
                )})`}
                value={formatMoney(view.warrantyServiceContingency)}
              />
              <Figure label="FINAL TOTAL COST" value={formatMoney(view.totalCost)} emphasis />
            </dl>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Final result
            </h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="FINAL TOTAL REVENUE" value={formatMoney(view.totalRevenue)} emphasis />
              <Figure label="FINAL GROSS PROFIT" value={formatMoney(view.grossProfit)} emphasis />
              <Figure label="FINAL GP %" value={formatPercent(view.grossProfitPercent)} emphasis />
              <Figure
                label="Applicable tier"
                value={view.tierLabel ?? "No matching tier"}
              />
              <Figure label="Standard rate" value={formatPercent(view.standardCommissionRate)} />
              <Figure
                label="Draw reduction"
                value={
                  view.drawRateReduction > 0
                    ? `− ${formatPercent(view.drawRateReduction)}`
                    : "Not on draw"
                }
              />
              <Figure
                label="Final effective rate"
                value={formatPercent(view.effectiveCommissionRate)}
                emphasis
              />
              <Figure
                label="Final gross commission"
                value={formatMoney(view.finalGrossCommission)}
                emphasis
              />
              <Figure
                label="Previously recognized / paid"
                value={formatMoney(view.previouslyRecognized)}
              />
              <Figure
                label={`FINAL TRUE-UP — ${
                  outcome ? FINAL_TRUE_UP_OUTCOME_LABELS[outcome] : ""
                }`}
                value={formatMoney(view.finalTrueUp)}
                emphasis
              />
            </dl>
          </section>

          {openAudit ? (
            <div className="space-y-3 border-t border-line pt-4">
              {blockers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-ink">
                    Before this audit can be finalized:
                  </p>
                  <ul className="space-y-1.5">
                    {blockers.map((blocker) => (
                      <li
                        key={blocker}
                        className="flex items-start gap-2 text-sm leading-6 text-ink-muted"
                      >
                        <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                        <span>{blocker}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm leading-6 text-ink-muted">
                  Everything needed is present. Finalizing snapshots these figures, the plan
                  version, the tier and rates and the true-up above, records who finalized it
                  and when, and records the GP audit date. It does not create the final
                  true-up — that stays a separate step in the Commission section.
                </p>
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
                  : "Create the final true-up from the Commission section, which uses this finalized snapshot rather than the live estimate."}
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
                    Re-opening keeps this revision as history and starts the next revision in
                    review. It is only possible while no final true-up exists — a recognized
                    payout is never overwritten.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {audits.length > 0 ? (
        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Audit history
          </h3>
          <ul className="space-y-1 text-xs text-ink-muted">
            {audits.map((audit) => (
              <li key={audit.id}>
                Revision {audit.revision} · {audit.status.replace("_", " ")} · started{" "}
                {formatDateTime(audit.started_at)}
                {audit.finalized_at
                  ? ` · finalized ${formatDateTime(audit.finalized_at)} at ${formatMoney(
                      audit.final_true_up,
                    )} true-up`
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
        <Button type="button" disabled variant="secondary">
          Finalize audit
        </Button>
      ) : (
        <SubmitButton label="Finalize audit" pendingLabel="Finalizing…" />
      )}
      <FormAlert state={state} className="max-w-xl" />
    </form>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? "font-mono text-sm font-semibold tabular-nums text-ink"
            : "font-mono text-sm tabular-nums text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
