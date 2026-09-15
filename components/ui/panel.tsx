import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function Panel({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-heading` : undefined}
      className={cn("scroll-mt-6 space-y-4 rounded-xl border border-line bg-surface p-5", className)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2
            id={id ? `${id}-heading` : undefined}
            className="text-sm font-semibold tracking-tight text-ink"
          >
            {title}
          </h2>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
