"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PROJECT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Overview", href: PROJECT_ROUTES.project(projectId), description: "Project identity" },
    { label: "Sales", href: PROJECT_ROUTES.sales(projectId), description: "Revenue & GP" },
    { label: "Commission", href: PROJECT_ROUTES.commission(projectId), description: "Payout & audit" },
    { label: "History", href: PROJECT_ROUTES.history(projectId), description: "Changes & activity" },
  ];

  return (
    <nav aria-label="Project sections" className="rounded-xl border border-line bg-surface p-1.5">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {tabs.map((tab) => {
          const active = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "bg-surface-muted text-ink shadow-sm"
                  : "text-ink-muted hover:bg-surface-muted/70 hover:text-ink",
              )}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span className="mt-0.5 hidden text-xs text-ink-subtle sm:block">{tab.description}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
