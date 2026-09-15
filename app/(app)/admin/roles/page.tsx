import Link from "next/link";

import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireCapability } from "@/lib/auth/dal";
import { listRoleSummaries } from "@/lib/experience/queries";
import { formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Roles",
};

/**
 * The business role catalog.
 *
 * Business roles are experience profiles, not security roles: the counts here are
 * "what this role sees", and the security role each person holds still decides
 * what they are allowed to do.
 */
export default async function AdminRolesPage() {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const { catalog, roles } = await listRoleSummaries();

  return (
    <div className="space-y-6">
      {catalog.source === "registry" ? (
        <ConfigurationNotice
          title="The role experience tables are not reachable"
          description={
            catalog.note ??
            "The built-in defaults are being shown, and configuration cannot be saved. Apply supabase/migrations/20260915230000_business_architecture.sql and 20260915230200_seed_business_architecture.sql, then reload."
          }
        />
      ) : null}

      <Panel
        id="role-catalog"
        title="Business roles"
        description="Each role is a reusable experience: which modules it sees, which dashboard widgets it shows and which quick actions it offers. Click a role to configure it or open its read-only preview."
      >
        <TableWrap>
          <Table caption="Business roles">
            <thead>
              <tr>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th>Description</Th>
                <Th className="text-right">People</Th>
                <Th className="text-right">Modules</Th>
                <Th className="text-right">Widgets</Th>
                <Th className="text-right">Actions</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <Td>
                    <Link
                      href={`/admin/roles/${role.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {role.name}
                    </Link>
                    <span className="block font-mono text-xs text-ink-subtle">{role.key}</span>
                  </Td>
                  <Td className="text-ink-muted">
                    {formatText(role.departmentName, "Company-wide")}
                  </Td>
                  <Td className="max-w-md text-ink-muted">
                    {formatText(role.description, "—")}
                  </Td>
                  <TdNumeric>{role.assignedEmployeeCount}</TdNumeric>
                  <TdNumeric>{role.visibleModuleCount}</TdNumeric>
                  <TdNumeric>{role.dashboardWidgetCount}</TdNumeric>
                  <TdNumeric>{role.quickActionCount}</TdNumeric>
                  <Td className="text-ink-muted">
                    {role.active ? "Active" : "Inactive"}
                    {role.isSystem ? " · system" : ""}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      <Panel
        id="role-preview-link"
        title="Role experience preview"
        description="See exactly what any role's system looks like, without changing your own session. The preview is read-only and is generated from this configuration."
      >
        <Link
          href="/admin/role-experiences"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open role experience preview
        </Link>
      </Panel>
    </div>
  );
}
