/**
 * Shared skeleton for route-level `loading.tsx` files, so navigation always has
 * an immediate, on-brand placeholder instead of a blank screen.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3 border-b border-line pb-6">
        <div className="h-3 w-24 animate-pulse rounded-full bg-line" />
        <div className="h-7 w-72 max-w-full animate-pulse rounded-lg bg-line" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-full bg-line" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse rounded-xl border border-line bg-surface"
          />
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-4 animate-pulse rounded-full bg-line"
            style={{ width: `${88 - index * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
