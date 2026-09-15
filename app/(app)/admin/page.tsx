import type { ReactNode } from "react";
import Link from "next/link";

import { ArrowRightIcon, UsersIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireCapability } from "@/lib/auth/dal";
import { listRoleSummaries } from "@/lib/experience/queries";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions/roles";
import { formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Administration",
};

/**
 * Administration landing.
 *
 * Two role models share this page on purpose, because the distinction is the
 * architecture: security roles decide what somebody may do, business roles decide
 * what their app looks like. Both are listed here with a link to where each is
 * configured.
 */
export default async function AdminPage() {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const { catalog, roles } = await listRoleSummaries();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminCard
          href="/admin/users"
          icon={<UsersIcon className="h-4 w-4" />}
          title="Users, departments and roles"
          description="Create accounts, set the security role, and assign each person a primary department and business role."
        />
        <AdminCard
          href="/admin/role-experiences"
          icon={<ArrowRightIcon className="h-4 w-4" />}
          title="Role experiences"
          description="Preview any role's modules, dashboard, quick actions, knowledge scope and permission summary — read only."
        />
      </div>

      <Panel
        id="role-catalog-summary"
        title="Business role catalog"
        description="What each role's app experience looks like. This is configuration, not security: editing it changes what is shown, never what is allowed."
        actions={
          <Link
            href="/admin/roles"
            className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
          >
            Configure
          </Link>
        }
      >
        <TableWrap>
          <Table caption="Business roles">
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th className="text-right">People</Th>
                <Th className="text-right">Modules</Th>
                <Th className="text-right">Widgets</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <Td>
                    <Link
                      href={`/admin/roles/${role.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {role.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-muted">
                    {formatText(role.departmentName, "Company-wide")}
                  </Td>
                  <TdNumeric>{role.assignedEmployeeCount}</TdNumeric>
                  <TdNumeric>{role.visibleModuleCount}</TdNumeric>
                  <TdNumeric>{role.dashboardWidgetCount}</TdNumeric>
                  <TdNumeric>{role.quickActionCount}</TdNumeric>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      <Panel
        id="security-roles"
        title="Security roles"
        description="What a portal account is allowed to do. These are enforced in the database by Row Level Security and re-checked by every Server Action, and a business role can never widen them."
      >
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role} className="rounded-lg border border-line bg-surface-muted p-4">
              <dt className="text-sm font-medium text-ink">{ROLE_LABELS[role]}</dt>
              <dd className="text-xs leading-5 text-ink-muted">{ROLE_DESCRIPTIONS[role]}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {catalog.source === "registry" ? (
        <p className="text-xs leading-5 text-ink-subtle">
          The role experience tables are not reachable, so the built-in defaults are being shown.
          Apply the Phase 5 migrations to manage this configuration from the database.
        </p>
      ) : null}
    </div>
  );
}

function AdminCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="space-y-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted">
          {icon}
        </span>
        <span className="block pt-3 text-sm font-medium text-ink">{title}</span>
        <span className="block text-sm leading-6 text-ink-muted">{description}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
