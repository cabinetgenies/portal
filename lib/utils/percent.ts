/**
 * Percentages are exchanged with the UI as percent points (36, 33.5) and stored
 * as decimals (0.36, 0.335).
 */

export function toDecimalPercent(percentPoints: number) {
  return Math.round((percentPoints / 100) * 1_000_000) / 1_000_000;
}

export function fromDecimalPercent(decimal: number | null | undefined) {
  if (decimal === null || decimal === undefined) {
    return null;
  }

  return Math.round(decimal * 100 * 1_000_000) / 1_000_000;
}
