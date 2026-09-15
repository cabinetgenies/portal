import Link from "next/link";

import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { ArrowRightIcon } from "@/components/icons";
import type { ResolvedQuickAction } from "@/lib/experience/types";
import { cn } from "@/lib/utils/cn";

/**
 * The role's quick actions.
 *
 * Actions come from the registry through the role configuration, so this renders
 * whatever the role is entitled to and nothing else. An action whose destination
 * does not exist is catalogued inactive and filtered out by the resolver before it
 * ever reaches here, which is why there is no "coming soon" button in sight.
 */
export function QuickActions({ actions }: { actions: readonly ResolvedQuickAction[] }) {
  if (actions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">
        No quick actions are configured for this role yet. An administrator can add
        them under Admin → Roles.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.iconKey ? NAV_ICONS[action.iconKey] : ArrowRightIcon;
        const shared = cn(
          "inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink",
          "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        );

        if (!action.href) {
          return (
            <li key={action.key}>
              <span
                aria-disabled="true"
                title={action.description}
                className={cn(shared, "cursor-not-allowed border-dashed text-ink-muted")}
              >
                <Icon className="h-4 w-4" />
                {action.label}
              </span>
            </li>
          );
        }

        return (
          <li key={action.key}>
            <Link
              href={action.href}
              title={action.description}
              className={cn(shared, "hover:border-line-strong hover:bg-surface-muted")}
            >
              <Icon className="h-4 w-4 text-ink-subtle" />
              {action.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
