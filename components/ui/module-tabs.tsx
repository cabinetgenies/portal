"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

export type ModuleTab = {
  label: string;
  href: string;
};

/**
 * Underline tab bar shared by the module shells (Commissions, Administration).
 * The longest matching route wins, so a section root and its children never
 * appear active at the same time.
 */
export function ModuleTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: ModuleTab[];
}) {
  const pathname = usePathname();

  const activeHref =
    tabs
      .filter((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
    <nav aria-label={label} className="-mb-px overflow-x-auto">
      <ul className="flex min-w-max items-center gap-1 border-b border-line">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;

          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  active
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
