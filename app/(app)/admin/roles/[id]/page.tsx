import Link from "next/link";
import { notFound } from "next/navigation";

import {
  RoleExperienceEditor,
  type RoleExperienceEntry,
} from "@/components/admin/role-experience-editor";
import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireCapability } from "@/lib/auth/dal";
import {
  findBusinessRole,
  listAssignedEmployeesForRole,
  loadExperienceCatalog,
} from "@/lib/experience/queries";
import { moduleCapabilities, quickActionCapabilities } from "@/lib/permissions/module-capabilities";
import { knowledgeTypeLabel } from "@/lib/knowledge/model";
import { listKnowledgeItems } from "@/lib/knowledge/queries";
import { formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Role",
};

/**
 * One business role, in full.
 *
 * Overview, module experience, dashboard widgets, quick actions, knowledge scope
 * and the people assigned to it — the same six things the role experience preview
 * describes, except that here an administrator can change the first four.
 */
export default async function AdminRoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const { id } = await params;
  const catalog = await loadExperienceCatalog();
  const role = findBusinessRole(catalog, decodeURIComponent(id));

  if (!role) {
    notFound();
  }

  const isEditable = catalog.source === "database";
  const moduleAssignments = catalog.configuration.roleModules[role.key] ?? [];
  const widgetAssignments = catalog.configuration.roleWidgets[role.key] ?? [];
  const actionAssignments = catalog.configuration.roleActions[role.key] ?? [];

  // Every registry item is listed, not only the assigned ones: the point of the
  // screen is to show the decisions, including "this role does not see Inventory".
  const moduleEntries: RoleExperienceEntry[] = catalog.configuration.modules.map((module) => {
    const assignment = moduleAssignments.find((candidate) => candidate.moduleKey === module.key);
    const required = moduleCapabilities(module.key);

    return {
      key: module.key,
      label: module.name,
      description: module.description,
      isVisible: assignment?.isVisible ?? false,
      displayOrder: assignment?.displayOrder ?? module.displayOrder,
      meta: required.length === 0 ? module.href : `${module.href} · requires ${required.join(" or ")}`,
    };
  });

  const widgetEntries: RoleExperienceEntry[] = catalog.configuration.widgets.map((widget) => {
    const assignment = widgetAssignments.find((candidate) => candidate.widgetKey === widget.key);

    return {
      key: widget.key,
      label: widget.name,
      description: widget.description,
      isVisible: assignment?.isVisible ?? false,
      displayOrder: assignment?.displayOrder ?? widget.displayOrder,
      meta: `${widget.componentKey} · span ${assignment?.span ?? 1}`,
    };
  });

  const actionEntries: RoleExperienceEntry[] = catalog.configuration.actions.map((action) => {
    const assignment = actionAssignments.find((candidate) => candidate.actionKey === action.key);
    const required = quickActionCapabilities(action.key);

    return {
      key: action.key,
      label: action.label,
      description: action.isActive
        ? action.description
        : `${action.description} (inactive in the registry — not offered anywhere yet)`,
      isVisible: (assignment?.isVisible ?? false) && action.isActive,
      displayOrder: assignment?.displayOrder ?? action.displayOrder,
      meta: [
        action.href ?? action.actionKey ?? "—",
        required.length > 0 ? `requires ${required.join(" or ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  const [employees, knowledge] = await Promise.all([
    listAssignedEmployeesForRole(isEditable ? role.id : null),
    listKnowledgeItems({ roleIds: isEditable ? [role.id] : [] }),
  ]);

  return (
    <div className="space-y-6">
      {!isEditable ? (
        <ConfigurationNotice
          title="This role is read-only while the defaults are in use"
          description={
            catalog.note ??
            "The role experience tables are not reachable, so the configuration shown comes from the code registry. Apply the Phase 5 migrations to make it editable here."
          }
        />
      ) : null}

      <Panel
        id="role-overview"
        title={`${role.name} — overview`}
        description={formatText(role.description, undefined)}
      >
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Key" value={role.key} mono />
          <SummaryItem
            label="Department"
            value={formatText(role.departmentName, "Company-wide")}
          />
          <SummaryItem label="Type" value={role.isSystem ? "System role" : "Configurable role"} />
          <SummaryItem label="Status" value={role.active ? "Active" : "Inactive"} />
          <SummaryItem label="Visible modules" value={`${moduleEntries.filter((entry) => entry.isVisible).length}`} />
          <SummaryItem label="Widgets" value={`${widgetEntries.filter((entry) => entry.isVisible).length}`} />
          <SummaryItem label="Quick actions" value={`${actionEntries.filter((entry) => entry.isVisible).length}`} />
          <SummaryItem label="Assigned people" value={`${employees.length}`} />
        </dl>
        <p className="text-sm text-ink-muted">
          This role decides what is <em>shown</em>. What a person is allowed to do comes from
          their security role and from Row Level Security, and nothing on this page can widen
          it.{" "}
          <Link
            href={`/admin/role-experiences?role=${role.key}`}
            className="underline underline-offset-4 hover:text-ink"
          >
            Open the read-only preview
          </Link>
          .
        </p>
      </Panel>

      <Panel
        id="role-modules"
        title="Module experience"
        description="Which modules this role sees, in which order, and which the role configures as priority. Showing a module here never grants access to it — the module's own capability requirement and the underlying policies still apply."
      >
        <RoleExperienceEditor
          roleId={role.id}
          kind="module"
          entries={moduleEntries}
          emptyMessage="No modules are registered."
        />
      </Panel>

      <Panel
        id="role-widgets"
        title="Dashboard widgets"
        description="The widgets this role's Home dashboard renders. Component keys are shared: three commission widgets are one amount renderer over three data sets."
      >
        <RoleExperienceEditor
          roleId={role.id}
          kind="widget"
          entries={widgetEntries}
          emptyMessage="No widgets are registered."
        />
      </Panel>

      <Panel
        id="role-actions"
        title="Quick actions"
        description="The actions this role is offered on its dashboard. An action whose destination does not exist yet stays inactive in the registry rather than appearing as a dead button."
      >
        <RoleExperienceEditor
          roleId={role.id}
          kind="action"
          entries={actionEntries}
          emptyMessage="No quick actions are registered."
        />
      </Panel>

      <Panel
        id="role-knowledge"
        title="Knowledge scope"
        description="Published knowledge scoped to this role. An item with no role or department is company-wide and appears for everyone."
      >
        {knowledge.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-sm text-ink-muted">
            No knowledge items are scoped to this role yet. Knowledge content has not been
            migrated from Notion; the metadata foundation is ready for it under /knowledge.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {knowledge.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="font-medium text-ink">{item.title}</span>
                <span className="text-xs text-ink-subtle">
                  {knowledgeTypeLabel(item.type)} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="role-employees"
        title="Assigned employees"
        description="Profiles whose primary business role is this one. Assignment lives on the profile (Admin → Users) and is recorded in the audit trail."
      >
        {employees.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-sm text-ink-muted">
            Nobody is assigned to this role yet. Until assignments are made, each account falls
            back to its security role and the shell says so.
          </p>
        ) : (
          <TableWrap>
            <Table caption="Assigned employees">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Department</Th>
                  <Th>Email</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.profileId}>
                    <Td className="font-medium">{employee.name}</Td>
                    <Td className="text-ink-muted">{formatText(employee.departmentName)}</Td>
                    <Td className="text-ink-muted">{formatText(employee.email)}</Td>
                    <Td className="text-ink-muted">{employee.active ? "Active" : "Deactivated"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-sm text-ink" : "text-sm text-ink"}>{value}</dd>
    </div>
  );
}
