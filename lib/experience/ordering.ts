/**
 * Ordering for role experience configuration.
 *
 * Deliberately a plain reorder, not a drag-and-drop layout engine: an
 * administrator moves an item one place up or down, and the resulting
 * display_order values are renormalised to 10, 20, 30 … so they never drift into
 * ties or exhaust the gap between them.
 */

export type OrderedAssignment = { key: string; displayOrder: number };

export const DISPLAY_ORDER_STEP = 10;

export type MoveDirection = "up" | "down";

export function isMoveDirection(value: unknown): value is MoveDirection {
  return value === "up" || value === "down";
}

/**
 * Move one entry up or down, returning every entry's settled order.
 *
 * A move at the edge of the list is a no-op rather than an error: the buttons that
 * produce it are disabled in the UI, and a no-op is the honest result for a
 * request that asks for something that cannot happen.
 */
export function reorderAssignments(
  entries: readonly OrderedAssignment[],
  movedKey: string,
  direction: MoveDirection,
): OrderedAssignment[] {
  const sorted = [...entries].sort(compareAssignments);
  const index = sorted.findIndex((entry) => entry.key === movedKey);

  if (index === -1) {
    return sorted.map((entry, position) => normalise(entry, position));
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (targetIndex >= 0 && targetIndex < sorted.length) {
    const next = [...sorted];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    return next.map((entry, position) => normalise(entry, position));
  }

  return sorted.map((entry, position) => normalise(entry, position));
}

/**
 * The rows an update needs to write: only the ones whose order actually changed.
 * Writing two rows instead of the whole list keeps the audit trail readable.
 */
export function changedOrderRows(
  before: readonly OrderedAssignment[],
  after: readonly OrderedAssignment[],
) {
  const beforeByKey = new Map(before.map((entry) => [entry.key, entry.displayOrder]));

  return after.filter((entry) => beforeByKey.get(entry.key) !== entry.displayOrder);
}

function compareAssignments(a: OrderedAssignment, b: OrderedAssignment) {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  return a.key.localeCompare(b.key);
}

function normalise(entry: OrderedAssignment, position: number): OrderedAssignment {
  return { key: entry.key, displayOrder: (position + 1) * DISPLAY_ORDER_STEP };
}
