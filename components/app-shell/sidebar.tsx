import { Brand } from "@/components/app-shell/brand";
import { NavList } from "@/components/app-shell/nav-list";
import { UserPanel, type SessionUser } from "@/components/app-shell/user-panel";
import { AssistantLaunchLink } from "@/components/assistant/assistant-launch-link";
import type { NavSection } from "@/lib/permissions/navigation";

/**
 * Persistent desktop sidebar: brand, portal navigation and the signed-in user.
 */
export function Sidebar({
  sections,
  user,
}: {
  sections: NavSection[];
  user: SessionUser;
}) {
  return (
    <aside
      aria-label="Portal navigation"
      className="hidden w-[17.5rem] shrink-0 flex-col gap-8 border-r border-white/5 bg-graphite px-4 py-6 lg:sticky lg:top-0 lg:flex lg:h-dvh"
    >
      <div className="px-2">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavList sections={sections} />
      </div>
      <AssistantLaunchLink />
      <UserPanel user={user} />
    </aside>
  );
}
