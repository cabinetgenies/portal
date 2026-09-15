import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";

export const metadata = {
  title: "Settings",
};

/**
 * Portal settings — an index, not a fake settings form.
 *
 * "Company settings" used to be promised on a card that did nothing. This page
 * lists where each kind of configuration actually lives today and says plainly what
 * is not built yet, so a reader is never sent somewhere that cannot help them.
 */
export default async function AdminSettingsPage() {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const catalog = await loadExperienceCatalog();

  return (
    <div className="space-y-6">
      <Panel
        id="settings-index"
        title="Where configuration lives"
        description="Each of these is a real screen with real persistence behind it. Nothing on this page pretends to be a setting."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          <SettingLink
            href="/admin/users"
            title="Users and assignments"
            description="Portal accounts, security roles, department and business-role assignment, reporting lines and status."
          />
          <SettingLink
            href="/admin/departments"
            title="Departments"
            description="The ten official departments: name, description, owner and active status."
          />
          <SettingLink
            href="/admin/roles"
            title="Business roles"
            description="The role catalog and, per role, its modules, dashboard widgets and quick actions."
          />
          <SettingLink
            href="/admin/role-experiences"
            title="Role experience preview"
            description="Read-only preview of what each role's system looks like."
          />
          <SettingLink
            href="/admin/compensation-plans"
            title="Compensation plans"
            description="Plans, effective-dated versions and GP bands."
          />
          <SettingLink
            href="/admin/commission-settings"
            title="Commission settings"
            description="Deposit payout, draw reduction, burden and warranty defaults."
          />
        </ul>
      </Panel>

      <Panel
        id="settings-environment"
        title="Environment"
        description="What this deployment is currently reading its configuration from."
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <EnvironmentItem
            label="Role experience source"
            value={
              catalog.source === "database"
                ? "Database configuration"
                : "Code registry (built-in defaults)"
            }
          />
          <EnvironmentItem
            label="Registered modules"
            value={`${catalog.configuration.modules.length}`}
          />
          <EnvironmentItem
            label="Business roles"
            value={`${catalog.businessRoles.length}`}
          />
          <EnvironmentItem label="Departments" value={`${catalog.departments.length}`} />
        </dl>
        {catalog.note ? (
          <p className="text-sm leading-6 text-ink-muted">{catalog.note}</p>
        ) : null}
      </Panel>

      <Panel
        id="settings-not-built"
        title="Not built yet"
        description="Named so nobody has to guess whether a setting exists."
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-muted">
          <li>Company profile, logo and branding.</li>
          <li>Integration credentials, including Buildertrend.</li>
          <li>Email and notification templates.</li>
          <li>Creating or deleting departments from the UI — the official ten are seeded.</li>
          <li>
            Per-user dashboard layout. The role is the unit of configuration, on purpose.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function SettingLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block space-y-1 rounded-lg border border-line bg-surface-muted p-4 transition-colors hover:border-line-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-sm leading-6 text-ink-muted">{description}</span>
      </Link>
    </li>
  );
}

function EnvironmentItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}
