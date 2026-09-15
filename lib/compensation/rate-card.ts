import { toNumber } from "@/lib/commission/financials";

/**
 * Presentation helpers for the employee-facing commission rate card.
 *
 * The numbers come from the plan version's tiers; this module only turns a band's
 * bounds into the way a person reads them ("30–34.99%", "49%+", "Below 30%"). The
 * card and the calculation therefore cannot drift: both read the same rows.
 */

export const COMMISSION_RATE_CARD_TITLE = "Cabinet Genies Sales Designer Commission";

export const COMMISSION_RATE_CARD_EXPLANATION =
  "Your commission rate increases as job profitability improves. Below 30% GP, no commission is earned. Higher GP earns a higher percentage of gross profit.";

function percentText(value: number, digits: number) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function bandRangeLabel(
  lowerGpPercent: number | null,
  upperGpPercent: number | null,
): string {
  const lower = lowerGpPercent === null ? null : toNumber(lowerGpPercent);
  const upper = upperGpPercent === null ? null : toNumber(upperGpPercent);

  // An open bottom band — whether it is stored as null or as 0.00 — is "below" the
  // first threshold.
  if (lower === null || lower === 0) {
    return upper === null ? "All GP" : `Below ${percentText(upper, 0)}`;
  }

  if (upper === null) {
    return `${percentText(lower, 0)}+`;
  }

  // Upper bound is exclusive, so the band ends one hundredth of a point below it.
  // The lower bound of a range reads without a percent sign ("30–34.99%").
  return `${(lower * 100).toFixed(0)}–${percentText(upper - 0.0001, 2)}`;
}

export function bandRateLabel(rate: number | null) {
  return percentText(toNumber(rate), 0);
}
