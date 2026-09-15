import { cache } from "react";
import { redirect } from "next/navigation";

import { getSessionContext, type SessionContext } from "@/lib/auth/dal";
import { LOGIN_ROUTE } from "@/lib/auth/dal";
import { displayNameFor } from "@/lib/auth/identity";
import { assignmentSourceLabel, resolveAssignment, type RoleAssignment } from "@/lib/experience/assignment";
import type {
  BusinessRoleRecord,
  DepartmentRecord,
  ExperienceCatalog,
} from "@/lib/experience/catalog-types";
import { registryExperienceCatalog } from "@/lib/experience/registry-catalog";
import { roleExperienceFor } from "@/lib/experience/resolve";
import type {
  ExperienceConfiguration,
  RoleExperience,
  RoleModuleAssignment,
  RoleQuickActionAssignment,
  RoleWidgetAssignment,
} from "@/lib/experience/types";
import { isSupabaseConfigured } from "@/lib/env";
import { ALL_CAPABILITIES } from "@/lib/permissions/roles";
import { navIconKey } from "@/lib/permissions/navigation";
import {
  MODULE_NAV_SECTIONS,
  type AppModuleRow,
  type BusinessRoleRow,
  type DashboardWidgetRow,
  type DepartmentRow,
  type ModuleNavSection,
  type ProfileRow,
  type QuickActionRow,
  type RoleDashboardWidgetRow,
  type RoleModuleRow,
  type RoleQuickActionRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read layer for the role experience.
 *
 * One cached load per request returns the whole configuration snapshot — catalog
 * rows, role assignments and the ids the admin editors need. Everything below
 * that is a pure resolution step in lib/experience/resolve.ts.
 *
 * Failure behaviour is deliberate. A missing Phase 5 migration, an unconfigured
 * deployment or a permission error must not take the shell down: the loader falls
 * back to the code registry, records why, and the pages surface that reason. The
 * one thing it never does is invent access — a fallback changes what is *shown*,
 * never what is allowed.
 */

export const loadExperienceCatalog = cache(async function loadExperienceCatalog(): Promise<ExperienceCatalog> {
  const database = await loadDatabaseCatalog();
  return database ?? registryExperienceCatalog();
});

async function loadDatabaseCatalog(): Promise<ExperienceCatalog | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  let results;

  try {
    const supabase = await createSupabaseServerClient();

    results = await Promise.all([
      supabase.from("departments").select("*").order("display_order", { ascending: true }),
      supabase.from("business_roles").select("*").order("display_order", { ascending: true }),
      supabase.from("app_modules").select("*").order("display_order", { ascending: true }),
      supabase.from("dashboard_widgets").select("*").order("display_order", { ascending: true }),
      supabase.from("quick_actions").select("*").order("display_order", { ascending: true }),
      supabase.from("role_modules").select("*"),
      supabase.from("role_dashboard_widgets").select("*"),
      supabase.from("role_quick_actions").select("*"),
    ]);
  } catch (error) {
    console.error("Could not read the role experience configuration:", error);
    return null;
  }

  const failed = results.find((result) => result.error);

  if (failed?.error) {
    console.error(
      "Role experience configuration is unavailable, falling back to the code registry:",
      failed.error.message,
    );
    return null;
  }

  const [departmentRows, roleRows, moduleRows, widgetRows, actionRows, roleModuleRows, roleWidgetRows, roleActionRows] =
    results.map((result) => result.data ?? []) as [
      DepartmentRow[],
      BusinessRoleRow[],
      AppModuleRow[],
      DashboardWidgetRow[],
      QuickActionRow[],
      RoleModuleRow[],
      RoleDashboardWidgetRow[],
      RoleQuickActionRow[],
    ];

  // An empty registry means the migration ran but the seed did not, or the rows
  // were removed. Either way the code registry is a better answer than no shell.
  if (moduleRows.length === 0) {
    return registryExperienceCatalog(
      "The module registry table is empty, so the code registry is being used.",
    );
  }

  return {
    source: "database",
    note: null,
    departments: departmentRows.map(mapDepartment),
    businessRoles: roleRows.map((row) => mapBusinessRole(row, departmentRows)),
    configuration: mapConfiguration({
      moduleRows,
      widgetRows,
      actionRows,
      roleRows,
      roleModuleRows,
      roleWidgetRows,
      roleActionRows,
    }),
  };
}

function mapDepartment(row: DepartmentRow): DepartmentRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    ownerProfileId: row.owner_profile_id,
    active: row.active,
    displayOrder: row.display_order,
  };
}

function mapBusinessRole(row: BusinessRoleRow, departments: DepartmentRow[]): BusinessRoleRecord {
  const department = departments.find((candidate) => candidate.id === row.department_id) ?? null;

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    departmentId: row.department_id,
    departmentSlug: department?.slug ?? null,
    departmentName: department?.name ?? null,
    isSystem: row.is_system,
    active: row.active,
    displayOrder: row.display_order,
  };
}

function navSection(value: string): ModuleNavSection {
  return (MODULE_NAV_SECTIONS as readonly string[]).includes(value)
    ? (value as ModuleNavSection)
    : "primary";
}

function mapConfiguration({
  moduleRows,
  widgetRows,
  actionRows,
  roleRows,
  roleModuleRows,
  roleWidgetRows,
  roleActionRows,
}: {
  moduleRows: AppModuleRow[];
  widgetRows: DashboardWidgetRow[];
  actionRows: QuickActionRow[];
  roleRows: BusinessRoleRow[];
  roleModuleRows: RoleModuleRow[];
  roleWidgetRows: RoleDashboardWidgetRow[];
  roleActionRows: RoleQuickActionRow[];
}): ExperienceConfiguration {
  const keyByRoleId = new Map(roleRows.map((row) => [row.id, row.key]));
  const keyByModuleId = new Map(moduleRows.map((row) => [row.id, row.key]));
  const keyByWidgetId = new Map(widgetRows.map((row) => [row.id, row.key]));
  const keyByActionId = new Map(actionRows.map((row) => [row.id, row.key]));

  const roleModules: Record<string, RoleModuleAssignment[]> = {};
  const roleWidgets: Record<string, RoleWidgetAssignment[]> = {};
  const roleActions: Record<string, RoleQuickActionAssignment[]> = {};

  for (const row of roleModuleRows) {
    const roleKey = keyByRoleId.get(row.business_role_id);
    const moduleKey = keyByModuleId.get(row.module_id);
    if (!roleKey || !moduleKey) continue;

    (roleModules[roleKey] ??= []).push({
      moduleKey,
      isVisible: row.is_visible,
      isEmphasized: row.is_emphasized,
      isDefaultLanding: row.is_default_landing,
      displayOrder: row.display_order,
    });
  }

  for (const row of roleWidgetRows) {
    const roleKey = keyByRoleId.get(row.business_role_id);
    const widgetKey = keyByWidgetId.get(row.widget_id);
    if (!roleKey || !widgetKey) continue;

    (roleWidgets[roleKey] ??= []).push({
      widgetKey,
      isVisible: row.is_visible,
      span: row.span,
      displayOrder: row.display_order,
    });
  }

  for (const row of roleActionRows) {
    const roleKey = keyByRoleId.get(row.business_role_id);
    const actionKey = keyByActionId.get(row.quick_action_id);
    if (!roleKey || !actionKey) continue;

    (roleActions[roleKey] ??= []).push({
      actionKey,
      isVisible: row.is_visible,
      displayOrder: row.display_order,
    });
  }

  return {
    source: "database",
    modules: moduleRows.map((row) => ({
      id: row.id,
      key: row.key,
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      href: row.href,
      iconKey: navIconKey(row.icon_key),
      navSection: navSection(row.nav_section),
      displayOrder: row.display_order,
      isActive: row.is_active,
    })),
    widgets: widgetRows.map((row) => ({
      key: row.key,
      name: row.name,
      description: row.description ?? "",
      componentKey: row.component_key,
      isActive: row.is_active,
      displayOrder: row.display_order,
    })),
    actions: actionRows.map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description ?? "",
      href: row.href,
      actionKey: row.action_key,
      iconKey: row.icon_key ? navIconKey(row.icon_key) : null,
      isActive: row.is_active,
      displayOrder: row.display_order,
    })),
    roleModules,
    roleWidgets,
    roleActions,
  };
}

// ---------------------------------------------------------------------------
// The signed-in person's experience
// ---------------------------------------------------------------------------

export type SessionExperience = {
  session: SessionContext;
  profile: ProfileRow | null;
  assignment: RoleAssignment;
  assignmentLabel: string;
  experience: RoleExperience;
  catalogSource: ExperienceCatalog["source"];
  catalogNote: string | null;
};

/**
 * Resolves the shell's experience for the signed-in person.
 *
 * Returns null when there is no session, exactly like the data access layer, so a
 * caller can redirect. Never throws for a missing profile or an unapplied
 * migration: an unassigned profile still gets a usable baseline experience and the
 * shell tells the reader why.
 */
export const getSessionExperience = cache(
  async function getSessionExperience(): Promise<SessionExperience | null> {
    const session = await getSessionContext();
    if (!session) return null;

    const catalog = await loadExperienceCatalog();
    const assignment = resolveAssignment({
      catalog,
      profile: session.profile,
      authRole: session.role,
    });

    const experience = roleExperienceFor({
      roleKey: assignment.businessRoleKey,
      resolutionSource: assignment.source,
      departmentSlug: assignment.departmentSlug,
      capabilities: session.capabilities,
      configuration: catalog.configuration,
    });

    return {
      session,
      profile: session.profile,
      assignment,
      assignmentLabel: assignmentSourceLabel(assignment.source),
      experience,
      catalogSource: catalog.source,
      catalogNote: catalog.note,
    };
  },
);

/**
 * The page-level entry point: the session experience, or a redirect to sign in.
 * Pages use this instead of `getSessionExperience()` so none of them has to
 * handle the unauthenticated case twice.
 */
export async function requireSessionExperience(): Promise<SessionExperience> {
  const state = await getSessionExperience();

  if (!state) {
    redirect(LOGIN_ROUTE);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Admin views
// ---------------------------------------------------------------------------

export type RoleSummary = BusinessRoleRecord & {
  visibleModuleCount: number;
  dashboardWidgetCount: number;
  quickActionCount: number;
  assignedEmployeeCount: number;
};

/**
 * Every business role with the counts /admin/roles shows.
 *
 * Employee counts come from one grouped read of profiles. Administrators can read
 * every profile already; a non-administrator who somehow reached this function
 * would only ever count the rows RLS lets them see, and the page is gated on
 * `administer:portal` anyway.
 */
export const listRoleSummaries = cache(async function listRoleSummaries(): Promise<{
  catalog: ExperienceCatalog;
  roles: RoleSummary[];
}> {
  const catalog = await loadExperienceCatalog();
  const assignedCounts = await loadAssignedRoleCounts();

  const roles = catalog.businessRoles.map<RoleSummary>((role) => {
    const modules = catalog.configuration.roleModules[role.key] ?? [];
    const widgets = catalog.configuration.roleWidgets[role.key] ?? [];
    const actions = catalog.configuration.roleActions[role.key] ?? [];

    return {
      ...role,
      visibleModuleCount: modules.filter((module) => module.isVisible).length,
      dashboardWidgetCount: widgets.filter((widget) => widget.isVisible).length,
      quickActionCount: actions.filter((action) => action.isVisible).length,
      assignedEmployeeCount: assignedCounts.get(role.id) ?? 0,
    };
  });

  return { catalog, roles };
});

async function loadAssignedRoleCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (!isSupabaseConfigured) {
    return counts;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("business_role_id")
      .eq("active", true);

    if (error) {
      console.error("Could not count business role assignments:", error.message);
      return counts;
    }

    for (const row of (data ?? []) as Pick<ProfileRow, "business_role_id">[]) {
      if (!row.business_role_id) continue;
      counts.set(row.business_role_id, (counts.get(row.business_role_id) ?? 0) + 1);
    }
  } catch (error) {
    console.error("Could not count business role assignments:", error);
  }

  return counts;
}

/**
 * The read-only preview for every role.
 *
 * Generated from configuration with the *full* capability set, because a business
 * role does not imply a security role: the preview answers "what would this role's
 * system look like", and the permission summary on the page explains separately
 * which security roles carry the capabilities each item needs. Nothing here
 * changes the viewer's session, and nothing here is impersonation.
 */
export async function listRolePreviews(): Promise<{
  catalog: ExperienceCatalog;
  previews: RoleExperience[];
}> {
  const catalog = await loadExperienceCatalog();

  const previews = catalog.businessRoles
    .filter((role) => role.active)
    .map((role) =>
      roleExperienceFor({
        roleKey: role.key,
        resolutionSource: "assigned",
        departmentSlug: role.departmentSlug,
        capabilities: ALL_CAPABILITIES,
        configuration: catalog.configuration,
      }),
    );

  return { catalog, previews };
}

export function rolePreviewFor(previews: readonly RoleExperience[], roleKey: string | null) {
  if (!roleKey) return previews[0] ?? null;
  return previews.find((preview) => preview.roleKey === roleKey) ?? previews[0] ?? null;
}

/**
 * Find a business role by database id or by its stable key.
 *
 * Both are accepted because the fallback catalog has no database ids: a link built
 * while the registry is standing in (`registry-role-project_manager`) still
 * resolves, and so does the real id once the migration is applied.
 */
export function findBusinessRole(catalog: ExperienceCatalog, idOrKey: string) {
  return (
    catalog.businessRoles.find(
      (role) => role.id === idOrKey || role.key === idOrKey || role.id === `registry-role-${idOrKey}`,
    ) ?? null
  );
}

export type AssignedEmployee = {
  profileId: string;
  name: string;
  email: string | null;
  active: boolean;
  departmentName: string | null;
};

/**
 * The people assigned to a business role.
 *
 * Reads profiles, which administrators can already read in full — this is the
 * same data the user directory shows, filtered by the assignment column.
 */
export async function listAssignedEmployeesForRole(
  businessRoleId: string | null,
): Promise<AssignedEmployee[]> {
  if (!businessRoleId || !isSupabaseConfigured) return [];

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("business_role_id", businessRoleId)
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Could not read the role's assigned employees:", error.message);
      return [];
    }

    return ((data ?? []) as ProfileRow[]).map((profile) => ({
      profileId: profile.id,
      name: displayNameFor(profile, profile.email),
      email: profile.email,
      active: profile.active,
      departmentName: profile.department,
    }));
  } catch (error) {
    console.error("Could not read the role's assigned employees:", error);
    return [];
  }
}

export type { BusinessRoleRecord, DepartmentRecord, ExperienceCatalog };
