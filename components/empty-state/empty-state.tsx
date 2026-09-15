import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-muted text-ink-subtle">
          {icon}
        </span>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-6 text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
