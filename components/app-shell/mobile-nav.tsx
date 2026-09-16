"use client";

import { useEffect, useState } from "react";

import { Brand } from "@/components/app-shell/brand";
import { NavList } from "@/components/app-shell/nav-list";
import { UserPanel, type SessionUser } from "@/components/app-shell/user-panel";
import { AssistantLaunchLink } from "@/components/assistant/assistant-launch-link";
import { CloseIcon, MenuIcon } from "@/components/icons";
import type { NavSection } from "@/lib/permissions/navigation";

/**
 * Mobile and tablet navigation: a sticky header bar with a slide-over drawer
 * that reuses the desktop navigation configuration.
 */
export function MobileNav({
  sections,
  user,
}: {
  sections: NavSection[];
  user: SessionUser;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <div className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <Brand tone="light" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="portal-mobile-navigation"
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <MenuIcon className="h-4 w-4" />
          Menu
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/40"
          />
          <div
            id="portal-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Portal navigation"
            className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-4 py-5"
          >
            <div className="flex items-center justify-between gap-4">
              <Brand tone="light" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line p-2 text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <CloseIcon className="h-4 w-4" />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>
            <NavList
              sections={sections}
              variant="drawer"
              onNavigate={() => setOpen(false)}
            />
            <AssistantLaunchLink variant="drawer" />
            <div className="mt-auto">
              <UserPanel user={user} tone="light" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
