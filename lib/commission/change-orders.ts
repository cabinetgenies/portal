import { roundMoney, toNumber } from "@/lib/commission/financials";
import type { JobChangeOrderRow } from "@/lib/supabase/database.types";

/**
 * Change order aggregation.
 *
 * Change orders are stored as child records; the job row only carries the derived
 * roll-ups. This module is the single place that turns rows into those totals, so
 * the form, the Server Actions and the job detail page can never disagree about
 * what the change orders add up to.
 */

export type ChangeOrderTotalsInput = {
  revenue: number;
  cost: number;
  active?: boolean;
};

export type ChangeOrderTotals = {
  /** Active change orders only. */
  count: number;
  revenue: number;
  cost: number;
  /** Revenue minus cost across the active change orders. */
  grossProfit: number;
};

export function isActiveChangeOrder(row: { active?: boolean }) {
  return row.active !== false;
}

/** The canonical roll-up: active change orders only, revenue and cost together. */
export function changeOrderTotals(
  rows: readonly ChangeOrderTotalsInput[],
): ChangeOrderTotals {
  const active = rows.filter(isActiveChangeOrder);

  let revenueCents = 0;
  let costCents = 0;

  for (const row of active) {
    revenueCents += Math.round(toNumber(row.revenue) * 100);
    costCents += Math.round(toNumber(row.cost) * 100);
  }

  const revenue = roundMoney(revenueCents / 100);
  const cost = roundMoney(costCents / 100);

  return {
    count: active.length,
    revenue,
    cost,
    grossProfit: roundMoney(revenue - cost),
  };
}

export function changeOrderTotalsFromRows(rows: readonly JobChangeOrderRow[]) {
  return changeOrderTotals(
    rows.map((row) => ({
      revenue: toNumber(row.revenue),
      cost: toNumber(row.cost),
      active: row.active,
    })),
  );
}

/** Display label: the number first, then the name, falling back to "Change order". */
export function changeOrderLabel(row: {
  name: string;
  change_order_number: string | null;
}) {
  const name = row.name.trim();
  const number = (row.change_order_number ?? "").trim();

  if (number && name) return `${number} · ${name}`;
  if (number) return number;
  if (name) return name;

  return "Change order";
}
