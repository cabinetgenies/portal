import { cn } from "@/lib/utils/cn";

/**
 * Metric card.
 *
 * `placeholder` keeps the honest "—" presentation used by modules that have no
 * data source yet; pass `placeholder={false}` when the value comes from real data
 * so the figure is exposed to assistive technology.
 */
export function MetricCard({
  label,
  value = "—",
  hint = "Placeholder",
  placeholder = true,
  className,
}: {
  label: string;
  value?: string;
  hint?: string;
  placeholder?: boolean;
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
        <p className="text-3xl leading-none font-semibold tracking-tight text-ink">
          {value}
        </p>
        <p className="text-xs text-ink-subtle">
          {hint}
          {placeholder ? (
            <span className="sr-only">
              {" "}
              — no data source is connected to this metric yet.
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
