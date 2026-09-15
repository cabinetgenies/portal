/**
 * Shared handling for PostgREST results.
 *
 * Reads never silently degrade into empty data: a real failure is logged on the
 * server and surfaces as the route-level error boundary instead of looking like
 * "there is nothing here".
 */

export function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T {
  if (result.error) {
    console.error(`Query failed (${context}):`, result.error.message);
    throw new Error(`Could not load ${context}.`);
  }

  return (result.data ?? []) as T;
}

export function requireRow<T>(
  result: { data: T | null; error: { message: string } | null },
  context: string,
): T | null {
  if (result.error) {
    console.error(`Query failed (${context}):`, result.error.message);
    throw new Error(`Could not load ${context}.`);
  }

  return result.data ?? null;
}
