import type { LiveCalculation } from "@/lib/commission/live-calculation";
import { InfoIcon } from "@/components/icons";
import { formatMoney, formatPercent } from "@/lib/utils/format";

/**
 * The Live Calculation panel.
 *
 * Presentational only: every figure arrives already computed by the canonical
 * financial function and commission engine, so the new-job form (live keystrokes)
 * and the job detail page (stored values) show the same thing and neither owns a
 * formula. Projected commission here is an estimate — it is what a deposit is
 * based on; a final true-up uses the finalized audit snapshot instead.
 */
export function LiveCalculationPanel({
  calculation,
  title = "Live calculation",
  sticky = true,
  footnote,
}: {
  calculation: LiveCalculation;
  title?: string;
  sticky?: boolean;
  footnote?: string;
}) {
  const { revenue, cost, profit, commission } = calculation;

  return (
    <aside className={sticky ? "xl:sticky xl:top-6 xl:self-start" : undefined}>
      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          <p className="text-xs leading-5 text-ink-subtle">
            Read-only. Every figure comes from the shared financial and commission
            engine — the same functions that store the job totals and create commission
            events.
          </p>
        </div>

        <Group title="Revenue">
          <Row label="Original contract price" value={formatMoney(revenue.originalContractPrice)} />
          <Row label="Change order revenue" value={formatMoney(revenue.changeOrderRevenue)} />
          <Row label="Total revenue" value={formatMoney(revenue.totalRevenue)} emphasis />
        </Group>

        <Group title="Cost">
          <Row label="Original costs" value={formatMoney(cost.originalCost)} />
          <Row label="Change order costs" value={formatMoney(cost.changeOrderCost)} />
          <Row label="Direct costs" value={formatMoney(cost.directJobCost)} />
          <Row label={`Burden (${formatPercent(cost.burdenPercent, 2)})`} value={formatMoney(cost.burdenCost)} />
          <Row
            label={`Warranty contingency (${formatPercent(cost.warrantyContingencyPercent, 2)})`}
            value={formatMoney(cost.warrantyServiceContingency)}
          />
          <Row label="Total costs" value={formatMoney(cost.totalCost)} emphasis />
        </Group>

        <Group title="Profit">
          <Row label="Gross profit" value={formatMoney(profit.grossProfit)} />
          <Row label="Gross profit %" value={formatPercent(profit.grossProfitPercent)} />
        </Group>

        <Group title="Commission">
          <Row
            label="Commissionable GP"
            value={formatMoney(commission.commissionableGrossProfit)}
          />
          <Row
            label="Commissionable GP %"
            value={formatPercent(commission.commissionableGpPercent)}
          />
          <Row
            label="Applicable tier"
            value={
              !commission.hasTiers
                ? "No plan version attached"
                : commission.tierLabel ?? "No matching tier"
            }
          />
          <Row label="Standard rate" value={formatPercent(commission.standardRate)} />
          <Row
            label="Draw reduction"
            value={
              commission.drawReduction > 0
                ? `− ${formatPercent(commission.drawReduction)}`
                : "Not on draw"
            }
          />
          <Row label="Effective commission rate" value={formatPercent(commission.effectiveRate)} />
          <Row
            label="Projected gross commission"
            value={formatMoney(commission.projectedGrossCommission)}
            emphasis
          />
          <Row
            label="Deposit target"
            value={`${formatMoney(commission.depositTarget)} · ${formatPercent(
              commission.depositPayoutPercent,
              0,
            )}`}
          />
          <Row
            label="Already paid / recognized"
            value={formatMoney(commission.previouslyRecognized)}
          />
          <Row
            label="Estimated remaining commission"
            value={formatMoney(commission.estimatedRemaining)}
            emphasis
          />
        </Group>

        {calculation.warnings.length > 0 ? (
          <ul className="space-y-2 border-t border-line pt-4">
            {calculation.warnings.map((warning) => (
              <li
                key={warning}
                className="flex items-start gap-2 text-xs leading-5 text-ink-muted"
              >
                <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="border-t border-line pt-4 text-xs leading-5 text-ink-subtle">
          {footnote ??
            "Projected commission is a live estimate and is what a deposit is calculated from. The final true-up uses the finalized final-audit snapshot, not this projection."}
        </p>
      </div>
    </aside>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <dl className="space-y-2.5 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
        {title}
      </p>
      {children}
    </dl>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs leading-5 text-ink-muted">{label}</dt>
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
