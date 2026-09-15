import { cn } from "@/lib/utils/cn";

/**
 * Metric cards are intentionally value-free until a module supplies real data.
 * The placeholder text is honest about that rather than showing invented numbers.
 */
export function MetricCard({
  label,
  value = "—",
  hint = "Placeholder",
  className,
}: {
  label: string;
  value?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-6 rounded-xl border border-line bg-surface p-5",
        className,
      )}
    >
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div className="space-y-1">
        <p
          className="text-3xl leading-none font-semibold tracking-tight text-ink"
          aria-hidden="true"
        >
          {value}
        </p>
        <p className="text-xs text-ink-subtle">
          {hint}
          <span className="sr-only">
            {" "}
            — no data source is connected to this metric yet.
          </span>
        </p>
      </div>
    </div>
  );
}
