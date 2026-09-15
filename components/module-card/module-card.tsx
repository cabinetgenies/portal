import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowRightIcon } from "@/components/icons";

export function ModuleCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between gap-6 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted">
          {icon}
        </span>
        <ArrowRightIcon className="h-4 w-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
      </span>
      <span className="space-y-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-sm leading-6 text-ink-muted">{description}</span>
      </span>
    </Link>
  );
}
