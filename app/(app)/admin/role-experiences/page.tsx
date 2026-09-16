import Link from "next/link";

import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { InfoIcon, LockIcon } from "@/components/icons";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { rolePreviewFor, listRolePreviews } from "@/lib/experience/queries";
import { moduleCapabilities, quickActionCapabilities } from "@/lib/permissions/module-capabilities";
import { ROLES, ROLE_LABELS, securityRolesForCapability, type Capability } from "@/lib/permissions/roles";
import { AGENT_MANIFESTS, toolById } from "@/lib/ai/registry";
import type { AiRoleAgentRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Role experiences",
};

/**
 * Role experience preview — read only.
 *
 * This is NOT impersonation. It does not switch sessions, does not change the
 * viewer's identity and does not bypass a single policy: it renders role
 * configuration through the same resolver the shell uses, with the viewer's own
 * admin session intact. Anything shown here is a description of configuration,
 * and the permission summary states plainly which security roles the gated items
 * actually require.
 */
export default async function RoleExperiencesPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const session = await requireCapability("administer:portal");
  if (!session.isAllowed) return null;

  const { role: requestedRole } = await searchParams;
  const { catalog, previews } = await listRolePreviews();
  const preview = rolePreviewFor(previews, requestedRole ?? null);
  const selectedRole =
    catalog.businessRoles.find((role) => role.key === preview?.roleKey) ?? null;
  const roleAgentRows = selectedRole ? await loadRoleAgents(selectedRole.id) : [];

  if (!preview) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-sm text-ink-muted">
        No business roles are configured yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold tracking-wide text-ink uppercase">
          <LockIcon className="h-3.5 w-3.5" />
          Role preview — read only
        </span>
        <p className="text-sm text-ink-muted">
          Generated from role configuration. Your session, your role and your permissions are
          unchanged, and nothing on this page writes anything.
        </p>
      </div>

      {catalog.source === "registry" ? (
        <ConfigurationNotice
          title="Showing the built-in defaults"
          description={
            catalog.note ??
            "The role experience tables are not reachable, so these previews come from the code registry rather than from stored configuration."
          }
        />
      ) : null}

      <nav aria-label="Choose a role" className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-ink-subtle uppercase">
          Role
        </p>
        <ul className="flex flex-wrap gap-2">
          {previews.map((candidate) => {
            const active = candidate.roleKey === preview.roleKey;

            return (
              <li key={candidate.roleKey}>
                <Link
                  href={`/admin/role-experiences?role=${candidate.roleKey}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "inline-flex rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    active
                      ? "border-line-strong bg-surface-muted text-ink"
                      : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {candidate.roleName}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Panel id="preview-summary" title="Selected role">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryItem label="Role" value={preview.roleName} />
          <SummaryItem
            label="Department"
            value={formatText(preview.departmentName, "Company-wide")}
          />
          <SummaryItem
            label="Resolves from"
            value={preview.resolutionSource === "assigned" ? "Assigned business role" : "Fallback"}
          />
          <SummaryItem label="Visible modules" value={`${preview.modules.length}`} />
        </dl>
        {preview.roleDescription ? (
          <p className="text-sm leading-6 text-ink-muted">{preview.roleDescription}</p>
        ) : null}
        <p className="flex items-start gap-2 text-xs leading-5 text-ink-subtle">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A business role never implies a security role. This preview shows what the
            configuration surfaces, and the permission summary below shows what each gated item
            actually requires.
          </span>
        </p>
      </Panel>

      <Panel
        id="preview-modules"
        title="Visible modules"
        description="In the order this role's navigation renders them."
      >
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {preview.modules.map((module) => {
            const Icon = NAV_ICONS[module.iconKey];
            const required = moduleCapabilities(module.key);

            return (
              <li
                key={module.key}
                className="space-y-1.5 rounded-lg border border-line bg-surface-muted p-4"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon className="h-4 w-4 text-ink-subtle" />
                  {module.name}
                  {module.isEmphasized ? (
                    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[0.68rem] font-medium tracking-wide text-accent-strong uppercase">
                      Priority
                    </span>
                  ) : null}
                </p>
                <p className="text-xs leading-5 text-ink-muted">{module.description}</p>
                <p className="font-mono text-xs text-ink-subtle">{module.href}</p>
                <p className="text-xs leading-5 text-ink-subtle">
                  {required.length === 0
                    ? "No capability required."
                    : `Requires ${required.join(" or ")}`}
                </p>
              </li>
            );
          })}
        </ul>

        {preview.blockedModules.length > 0 ? (
          <p className="text-xs leading-5 text-ink-subtle">
            Hidden by capability even though the role configures them:{" "}
            {preview.blockedModules.map((module) => module.name).join(", ")}.
          </p>
        ) : null}
      </Panel>

      <Panel
        id="preview-dashboard"
        title="Dashboard layout preview"
        description="The widgets this role's Home dashboard renders, in order. Each widget shows real data or an explicit empty state — never an invented figure."
      >
        {preview.widgets.length === 0 ? (
          <p className="text-sm text-ink-muted">No widgets assigned.</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {preview.widgets.map((widget) => (
              <li
                key={widget.key}
                className={cn(
                  "space-y-1 rounded-lg border border-line bg-surface-muted p-4",
                  widget.span > 1 ? "sm:col-span-2" : "",
                )}
              >
                <p className="text-sm font-medium text-ink">{widget.name}</p>
                <p className="text-xs leading-5 text-ink-muted">{widget.description}</p>
                <p className="font-mono text-xs text-ink-subtle">
                  {widget.componentKey} · span {widget.span}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel id="preview-actions" title="Quick actions">
        {preview.quickActions.length === 0 ? (
          <p className="text-sm text-ink-muted">No quick actions assigned.</p>
        ) : (
          <ul className="space-y-2">
            {preview.quickActions.map((action) => {
              const required = quickActionCapabilities(action.key);

              return (
                <li
                  key={action.key}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line bg-surface-muted px-4 py-3"
                >
                  <span className="text-sm font-medium text-ink">{action.label}</span>
                  <span className="text-xs text-ink-muted">{action.description}</span>
                  <span className="font-mono text-xs text-ink-subtle">
                    {action.href ?? action.actionKey ?? "—"}
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {required.length === 0 ? "No capability required" : required.join(" or ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        id="preview-knowledge"
        title="Knowledge scope"
        description="The BOS scope this role resolves to. Content is scoped by role, department, type and context key."
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <SummaryItem label="Role scope" value={preview.knowledgeScope.roleKey ?? "—"} />
          <SummaryItem
            label="Department scope"
            value={formatText(preview.knowledgeScope.departmentSlug, "Company-wide")}
          />
        </dl>
      </Panel>

      <Panel
        id="preview-ai-agents"
        title="Assigned AI agents"
        description="Which reviewed assistant agents are enabled for this business role in the AI pilot, and the capabilities their tools require."
      >
        {!selectedRole ? (
          <p className="text-sm text-ink-muted">No business role is selected.</p>
        ) : (
          <ul className="space-y-3">
            {AGENT_MANIFESTS.map((agent) => {
              const mapping = roleAgentRows.find((row) => row.agent_id === agent.id);
              const enabled = mapping?.enabled === true;

              return (
                <li key={agent.id} className="rounded-lg border border-line bg-surface-muted p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{agent.name}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-medium",
                        enabled
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-line bg-surface text-ink-muted",
                      )}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{agent.description}</p>
                  <ul className="mt-3 space-y-1.5">
                    {agent.allowedToolIds.map((toolId) => {
                      const tool = toolById(toolId);
                      if (!tool) return null;
                      const roles = tool.capabilities.length === 0
                        ? ["every authenticated role"]
                        : [...new Set(tool.capabilities.flatMap((cap) => securityRolesForCapability(cap as Capability)))];

                      return (
                        <li key={toolId} className="text-xs text-ink-subtle">
                          <span className="font-mono">{toolId}</span> —{" "}
                          {tool.capabilities.length === 0
                            ? "no capability required"
                            : tool.capabilities.join(" or ")}{" "}
                          {roles[0] === "every authenticated role"
                            ? ""
                            : `(held by ${roles.map((role) => ROLE_LABELS[role as keyof typeof ROLE_LABELS]).join(", ")})`}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        id="preview-permissions"
        title="Permission summary"
        description="Authorization comes from the security role on a profile, never from the business role. This is where the two meet."
      >
        <TableLikeSummary />
      </Panel>
    </div>
  );
}

async function loadRoleAgents(businessRoleId: string): Promise<AiRoleAgentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_role_agents")
    .select("*")
    .eq("business_role_id", businessRoleId);

  if (error) return [];
  return (data ?? []) as AiRoleAgentRow[];
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

/**
 * What the preview cannot know, said out loud.
 *
 * A business role is a row in a configuration table; it does not carry a security
 * role. So instead of pretending this role has permissions, the summary lists the
 * capabilities the visible items require and which security roles hold them.
 */
function TableLikeSummary() {
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((role) => (
          <div key={role} className="rounded-lg border border-line bg-surface-muted p-4">
            <dt className="text-sm font-medium text-ink">{ROLE_LABELS[role]}</dt>
            <dd className="text-xs leading-5 text-ink-muted">
              {securityRolesForCapability("administer:portal").includes(role)
                ? "Can administer the portal, including this configuration."
                : "Cannot change portal configuration."}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1.5 text-sm text-ink-muted">
        <li>
          <span className="font-mono text-xs text-ink-subtle">administer:portal</span> —{" "}
          {securityRolesForCapability("administer:portal")
            .map((role) => ROLE_LABELS[role])
            .join(", ")}
        </li>
        <li>
          <span className="font-mono text-xs text-ink-subtle">approve:commission</span> —{" "}
          {securityRolesForCapability("approve:commission")
            .map((role) => ROLE_LABELS[role])
            .join(", ")}
        </li>
        <li>
          <span className="font-mono text-xs text-ink-subtle">edit:job-financials</span> —{" "}
          {securityRolesForCapability("edit:job-financials")
            .map((role) => ROLE_LABELS[role])
            .join(", ")}
        </li>
      </ul>
    </div>
  );
}
