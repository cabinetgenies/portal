import {
  bandRangeLabel,
  bandRateLabel,
  COMMISSION_RATE_CARD_EXPLANATION,
  COMMISSION_RATE_CARD_TITLE,
} from "@/lib/compensation/rate-card";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { formatDate, formatPercent } from "@/lib/utils/format";

/**
 * The employee-facing commission rate card: the bands of the plan version in force
 * today, read straight from `compensation_plan_tiers`.
 */
export function CommissionRateCard({
  versionName,
  effectiveFrom,
  effectiveTo,
  tiers,
  canEdit,
  editHref,
}: {
  versionName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  tiers: readonly {
    id: string;
    sort_order: number;
    lower_gp_percent: number | null;
    upper_gp_percent: number | null;
    rate: number;
    label: string | null;
  }[];
  canEdit?: boolean;
  editHref?: string;
}) {
  const ordered = [...tiers].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Panel
      id="commission-rate-card"
      title={COMMISSION_RATE_CARD_TITLE}
      description={`Commission is a percentage of commissionable gross profit. Bands in force from ${formatDate(effectiveFrom)}${effectiveTo ? ` to ${formatDate(effectiveTo)}` : ""} (${versionName}).`}
    >
      {ordered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
          This plan version has no bands configured yet.
        </p>
      ) : (
        <TableWrap>
          <Table caption="Gross profit bands and the commission rate each one earns">
            <thead>
              <tr>
                <Th>GP band</Th>
                <Th className="text-right">Commission rate</Th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((tier) => (
                <tr key={tier.id}>
                  <Td>
                    <span className="font-medium text-ink">
                      {bandRangeLabel(tier.lower_gp_percent, tier.upper_gp_percent)}
                    </span>
                    {tier.label ? (
                      <span className="block text-xs text-ink-subtle">{tier.label}</span>
                    ) : null}
                  </Td>
                  <TdNumeric>
                    {bandRateLabel(tier.rate)}
                    <span className="mt-0.5 block text-xs font-normal text-ink-subtle">
                      {formatPercent(tier.rate, 0)} of commissionable GP
                    </span>
                  </TdNumeric>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <p className="text-sm leading-6 text-ink-muted">{COMMISSION_RATE_CARD_EXPLANATION}</p>
        <p className="text-xs leading-5 text-ink-subtle">
          Bands apply to final commissionable gross profit. Draw against commission lowers the
          rate you are paid by the configured number of percentage points while you are enrolled
          — it is never a multiplied-down rate — and a rate is never reduced below zero.
        </p>
        {canEdit && editHref ? (
          <p className="text-xs leading-5 text-ink-subtle">
            Rates are configuration, not code: edit them under Admin → Compensation plans. Changing
            them adds a new effective-dated version; jobs, audits and commission events calculated
            under an earlier version keep the rates they used.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
