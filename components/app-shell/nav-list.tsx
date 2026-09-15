"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { cn } from "@/lib/utils/cn";
import type { NavSection } from "@/lib/permissions/navigation";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavList({
  sections,
  onNavigate,
  variant = "sidebar",
}: {
  sections: NavSection[];
  onNavigate?: () => void;
  variant?: "sidebar" | "drawer";
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Portal sections" className="space-y-7">
      {sections.map((section) => (
        <div key={section.label} className="space-y-1.5">
          <p
            className={cn(
              "px-3 text-[0.68rem] font-semibold tracking-[0.16em] uppercase",
              variant === "sidebar" ? "text-white/40" : "text-ink-subtle",
            )}
          >
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isActivePath(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2",
                      variant === "sidebar"
                        ? cn(
                            "focus-visible:outline-white/70",
                            active
                              ? "bg-white/10 text-white"
                              : "text-white/70 hover:bg-white/5 hover:text-white",
                          )
                        : cn(
                            "focus-visible:outline-accent",
                            active
                              ? "bg-surface-muted text-ink"
                              : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                          ),
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[1.1rem] w-[1.1rem]",
                        active
                          ? "text-accent"
                          : variant === "sidebar"
                            ? "text-white/50"
                            : "text-ink-subtle",
                      )}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
