import { DepartmentEditor } from "@/components/admin/department-editor";
import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireCapability } from "@/lib/auth/dal";
import { listActiveProfileOptions } from "@/lib/admin/user-queries";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import { formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Departments",
};

/**
 * Departments.
 *
 * Where people belong, not what their app looks like. Departments own the grouping,
 * an optional owner and the role associations that the role catalog points back at.
 */
export default async function AdminDepartmentsPage() {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const catalog = await loadExperienceCatalog();
  const editable = catalog.source === "database";
  const owners = editable ? await listActiveProfileOptions() : [];

  const rolesByDepartment = new Map<string, string[]>();

  for (const role of catalog.businessRoles) {
    if (!role.departmentId) continue;
    const list = rolesByDepartment.get(role.departmentId) ?? [];
    list.push(role.name);
    rolesByDepartment.set(role.departmentId, list);
  }

  return (
    <div className="space-y-6">
      {!editable ? (
        <ConfigurationNotice
          title="Departments are read-only while the defaults are in use"
          description={
            catalog.note ??
            "The department table is not reachable, so the official ten are being shown from the code registry. Apply the Phase 5 migrations to edit them here."
          }
        />
      ) : null}

      <Panel
        id="departments"
        title="Departments"
        description="The ten official departments. A department is where an employee belongs; a business role is what their app experience looks like, and one does not determine the other."
      >
        <TableWrap>
          <Table caption="Departments">
            <thead>
              <tr>
                <Th>Department</Th>
                <Th>Description</Th>
                <Th>Owner</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {catalog.departments.map((department) => (
                <tr key={department.id}>
                  <Td>
                    <span className="font-medium text-ink">{department.name}</span>
                    <span className="block font-mono text-xs text-ink-subtle">
                      {department.slug}
                    </span>
                  </Td>
                  <Td className="max-w-md text-ink-muted">
                    {formatText(department.description, "—")}
                  </Td>
                  <Td className="text-ink-muted">
                    {department.ownerProfileId
                      ? ownerName(owners, department.ownerProfileId)
                      : "Unassigned"}
                  </Td>
                  <Td className="text-ink-muted">
                    {(rolesByDepartment.get(department.id) ?? []).join(", ") || "—"}
                  </Td>
                  <Td className="text-ink-muted">{department.active ? "Active" : "Inactive"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      {editable ? (
        <Panel
          id="department-editing"
          title="Edit a department"
          description="Name, description, owner and active status. Changes are written by a Server Action that re-checks the administration capability, and the database records the change in the audit trail."
        >
          <div className="space-y-3">
            {catalog.departments.map((department) => (
              <DepartmentEditor
                key={department.id}
                department={{
                  id: department.id,
                  name: department.name,
                  slug: department.slug,
                  description: department.description,
                  ownerProfileId: department.ownerProfileId,
                  active: department.active,
                }}
                owners={owners}
              />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function ownerName(owners: readonly { id: string; name: string }[], ownerId: string) {
  return owners.find((owner) => owner.id === ownerId)?.name ?? "Unknown profile";
}
