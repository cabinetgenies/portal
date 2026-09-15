import type { ReactNode } from "react";

import { MobileNav } from "@/components/app-shell/mobile-nav";
import { Sidebar } from "@/components/app-shell/sidebar";
import type { SessionUser } from "@/components/app-shell/user-panel";
import type { NavSection } from "@/lib/permissions/navigation";

/**
 * Authenticated application shell: persistent desktop sidebar, mobile drawer and
 * the main content column.
 */
export function AppShell({
  sections,
  user,
  children,
}: {
  sections: NavSection[];
  user: SessionUser;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      <a
        href="#portal-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-graphite focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <Sidebar sections={sections} user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav sections={sections} user={user} />
        {/*
          Deliberately not centred and not width-capped. This is an internal
          operations tool: the commission tables, job cards and configuration
          forms are the point, and a max-width here left large empty margins on
          wide displays while the sidebar stayed pinned. Padding keeps the
          content off the edges; nothing else constrains it.
        */}
        <main
          id="portal-content"
          className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
