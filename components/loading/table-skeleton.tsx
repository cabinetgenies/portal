/**
 * Skeleton for list and table screens.
 */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3 border-b border-line pb-6">
        <div className="h-3 w-24 animate-pulse rounded-full bg-line" />
        <div className="h-7 w-64 max-w-full animate-pulse rounded-lg bg-line" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-full bg-line" />
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line bg-surface-muted px-4 py-3">
          <div className="h-3 w-40 animate-pulse rounded-full bg-line" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-4">
              <div className="h-4 flex-1 animate-pulse rounded-full bg-line" />
              <div className="hidden h-4 flex-1 animate-pulse rounded-full bg-line sm:block" />
              <div className="hidden h-4 w-24 animate-pulse rounded-full bg-line lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
