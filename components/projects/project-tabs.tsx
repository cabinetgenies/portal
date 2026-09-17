"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PROJECT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils/cn";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Overview", href: PROJECT_ROUTES.project(projectId) },
    { label: "Sales", href: PROJECT_ROUTES.sales(projectId) },
    { label: "Commission", href: PROJECT_ROUTES.commission(projectId) },
    { label: "History", href: PROJECT_ROUTES.history(projectId) },
  ];

  return (
    <nav aria-label="Project sections" className="border-b border-line">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-accent text-ink"
                  : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
