import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { DashboardWidgetCard } from "@/components/dashboard/dashboard-widget-card";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RoleContext } from "@/components/dashboard/role-context";
import { ModuleCard } from "@/components/module-card/module-card";
import { PageHeader } from "@/components/page-header/page-header";
import { firstNameFor } from "@/lib/auth/identity";
import { loadWidgetData } from "@/lib/experience/dashboard-data";
import { requireSessionExperience } from "@/lib/experience/queries";
import { greetingForHour, portalHour } from "@/lib/utils/time";

export const metadata = {
  title: "Home",
};

/**
 * The role-aware dashboard.
 *
 * One page, resolved per role:
 *
 *   current user → business role → dashboard widgets → quick actions → modules
 *
 * There is deliberately no separate dashboard component per role. The role's
 * widget configuration decides what renders, each widget fetches its own data (or
 * says it has none), and the module cards come from the same registry the sidebar
 * uses.
 */
export default async function HomePage() {
  const state = await requireSessionExperience();
  const { experience, assignment, session, catalogSource, catalogNote } = state;
  const firstName = firstNameFor(session.profile, session.email);
  const greeting = greetingForHour(portalHour());

  const widgetData = await loadWidgetData(
    experience.widgets.map((widget) => widget.key),
    { session, profile: session.profile },
  );

  // Home is the dashboard itself, so it is not repeated as a workspace card.
  const workspaceModules = experience.modules.filter((module) => module.key !== "home");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Home"
        title={`${greeting}, ${firstName}`}
        description="Cabinet Genies operations portal — assembled for your role."
      />

      <RoleContext
        experience={experience}
        assignment={assignment}
        catalogSource={catalogSource}
        catalogNote={catalogNote}
      />

      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <div className="space-y-1">
          <h2
            id="quick-actions-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            Quick actions
          </h2>
          <p className="text-sm text-ink-muted">
            The things this role does most often — configured per role, and filtered by what
            this account is allowed to reach.
          </p>
        </div>
        <QuickActions actions={experience.quickActions} />
      </section>

      <section aria-labelledby="dashboard-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="dashboard-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            {experience.roleName} dashboard
          </h2>
          <p className="text-sm text-ink-muted">
            {experience.widgets.length} widget
            {experience.widgets.length === 1 ? "" : "s"} assigned to this role. A widget with
            no live data source says so rather than showing a placeholder figure.
          </p>
        </div>

        {experience.widgets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm text-ink-muted">
            No dashboard widgets are assigned to this role yet. An administrator can add them
            under Admin → Roles.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {experience.widgets.map((widget) => (
              <DashboardWidgetCard
                key={widget.key}
                widget={widget}
                data={
                  widgetData[widget.key] ?? {
                    status: "unavailable",
                    reason: "This widget has no data source yet.",
                  }
                }
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="workspace-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="workspace-heading" className="text-sm font-semibold tracking-tight text-ink">
            Your modules
          </h2>
          <p className="text-sm text-ink-muted">
            The modules this role sees, in the order configured for it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workspaceModules.map((module) => {
            const Icon = NAV_ICONS[module.iconKey];

            return (
              <ModuleCard
                key={module.key}
                href={module.href}
                title={module.isEmphasized ? `${module.name} · priority` : module.name}
                description={module.description}
                icon={<Icon className="h-4 w-4" />}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
