import type { StatusTone } from "@/lib/commission/types";
import { cn } from "@/lib/utils/cn";

const TONES: Record<StatusTone, string> = {
  neutral: "border-line bg-surface-muted text-ink-muted",
  info: "border-line bg-white text-ink",
  positive: "border-line bg-accent-soft text-accent-strong",
  warning: "border-line-strong bg-surface-muted text-ink",
  critical: "border-line bg-white text-accent-strong",
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
