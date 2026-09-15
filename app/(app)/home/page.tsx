import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon } from "@/components/icons";
import { MetricCard } from "@/components/metric-card/metric-card";
import { ModuleCard } from "@/components/module-card/module-card";
import { PageHeader } from "@/components/page-header/page-header";
import { requireSession } from "@/lib/auth/dal";
import { firstNameFor } from "@/lib/auth/identity";
import { navigationForCapabilities } from "@/lib/permissions/navigation";
import { greetingForHour, portalHour } from "@/lib/utils/time";

export const metadata = {
  title: "Dashboard",
};

const METRICS = [
  "Active Jobs",
  "Open Sales Opportunities",
  "Commission Actions",
  "Items Requiring Attention",
];

export default async function HomePage() {
  const session = await requireSession();
  const firstName = firstNameFor(session.profile, session.email);
  const greeting = greetingForHour(portalHour());

  // Workspace cards mirror the module navigation, minus Home and Administration.
  const modules = navigationForCapabilities(session.capabilities)
    .filter((section) => section.label !== "Home" && section.label !== "Administration")
    .flatMap((section) => section.items);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title={`${greeting}, ${firstName}`}
        description="Cabinet Genies Operations Portal"
      />

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((label) => (
          <MetricCard key={label} label={label} />
        ))}
      </section>

      <section aria-labelledby="workspace-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="workspace-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            Your Workspace
          </h2>
          <p className="text-sm text-ink-muted">
            Jump into the module you need. Each one is being brought online in turn.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const Icon = NAV_ICONS[module.icon];

            return (
              <ModuleCard
                key={module.href}
                href={module.href}
                title={module.label}
                description={module.description}
                icon={<Icon className="h-4 w-4" />}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="activity-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            Recent Activity
          </h2>
          <p className="text-sm text-ink-muted">
            Changes you and your team make across the portal.
          </p>
        </div>
        <EmptyState
          icon={<ActivityIcon className="h-5 w-5" />}
          title="No recent activity yet."
          description="Activity from commissions, sales, projects and production will appear here once those modules start recording data."
        />
      </section>
    </div>
  );
}
