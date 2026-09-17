"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { cn } from "@/lib/utils/cn";
import { isActivePath } from "@/lib/routes";
import type { NavItem, NavSection } from "@/lib/permissions/navigation";

function currentHref(pathname: string, sections: NavSection[]) {
  const hrefs = sections.flatMap((section) =>
    section.items.flatMap((item) => [
      ...(item.href ? [item.href] : []),
      ...(item.children ?? []).map((child) => child.href),
    ]),
  );

  return hrefs
    .filter((href) => isActivePath(pathname, href))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

function itemIsActive(item: NavItem, activeHref: string | null) {
  if (!activeHref) return false;
  if (item.href === activeHref) return true;
  return (item.children ?? []).some((child) => child.href === activeHref);
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
  const activeHref = currentHref(pathname, sections);

  return (
    <nav aria-label="Portal sections" className="space-y-7">
      {sections.map((section, sectionIndex) => (
        <div key={section.label || `section-${sectionIndex}`} className="space-y-1.5">
          {section.label ? (
            <p
              className={cn(
                "px-3 text-[0.68rem] font-semibold tracking-[0.16em] uppercase",
                variant === "sidebar" ? "text-white/40" : "text-ink-subtle",
              )}
            >
              {section.label}
            </p>
          ) : null}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = itemIsActive(item, activeHref);
              const hasChildren = Boolean(item.children?.length);

              return (
                <li key={`${item.label}-${item.href ?? "group"}`}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={item.href === activeHref ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2",
                        variant === "sidebar"
                          ? cn(
                              "focus-visible:outline-white/70",
                              active
                                ? "bg-white/10 text-white"
                                : "text-white/75 hover:bg-white/5 hover:text-white",
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
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    </Link>
                  ) : (
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm font-semibold",
                        variant === "sidebar" ? "text-white/75" : "text-ink-muted",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[1.1rem] w-[1.1rem]",
                          variant === "sidebar" ? "text-white/50" : "text-ink-subtle",
                        )}
                      />
                      <span>{item.label}</span>
                    </div>
                  )}

                  {hasChildren ? (
                    <ul
                      className={cn(
                        "mt-1 space-y-0.5 border-l pl-3",
                        variant === "sidebar"
                          ? "ml-[1.32rem] border-white/10"
                          : "ml-[1.32rem] border-line",
                      )}
                    >
                      {item.children?.map((child) => {
                        const childActive = child.href === activeHref;

                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={childActive ? "page" : undefined}
                              className={cn(
                                "block rounded-md px-3 py-1.5 text-[0.82rem] font-medium transition-colors",
                                "focus-visible:outline-2 focus-visible:outline-offset-2",
                                variant === "sidebar"
                                  ? cn(
                                      "focus-visible:outline-white/70",
                                      childActive
                                        ? "bg-white/8 text-white"
                                        : "text-white/55 hover:bg-white/5 hover:text-white/90",
                                    )
                                  : cn(
                                      "focus-visible:outline-accent",
                                      childActive
                                        ? "bg-surface-muted text-ink"
                                        : "text-ink-subtle hover:bg-surface-muted hover:text-ink",
                                    ),
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
