import {
  FALLBACK_ROLE_KEY_BY_AUTH_ROLE,
  businessRoleDefinition,
  departmentNameForSlug,
} from "@/lib/business/catalog";
import type { ExperienceCatalog } from "@/lib/experience/catalog-types";
import type { RoleResolutionSource } from "@/lib/experience/types";
import type { Role } from "@/lib/permissions/roles";
import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * Which business role and department a profile resolves to.
 *
 * Three outcomes, in priority order:
 *
 *   assigned             the profile has a business role — the intended path
 *   auth_role_fallback   no business role yet, so the security role is used as a
 *                        reasonable approximation (a CEO still sees the company)
 *   unassigned           no business role and no useful security role: the
 *                        baseline experience, and the shell says so
 *
 * The fallback exists because business-role assignment is new in this phase and
 * every existing profile predates it. Being explicit about the fallback is better
 * than silently guessing: the shell and the admin preview both show which one
 * applied.
 */
export type RoleAssignment = {
  businessRoleId: string | null;
  businessRoleKey: string | null;
  businessRoleName: string | null;
  departmentId: string | null;
  departmentSlug: string | null;
  departmentName: string | null;
  source: RoleResolutionSource;
};

export function resolveAssignment({
  catalog,
  profile,
  authRole,
}: {
  catalog: Pick<ExperienceCatalog, "businessRoles" | "departments">;
  profile: ProfileRow | null;
  authRole: Role;
}): RoleAssignment {
  const assignedRole = findAssignedRole(catalog.businessRoles, profile?.business_role_id ?? null);
  const fallbackKey = assignedRole ? null : FALLBACK_ROLE_KEY_BY_AUTH_ROLE[authRole];
  const fallbackRole = fallbackKey ? businessRoleDefinition(fallbackKey) : null;

  const roleKey = assignedRole?.key ?? fallbackRole?.key ?? null;
  const role = assignedRole ?? null;

  const department =
    findAssignedDepartment(catalog, profile?.department_id ?? null) ??
    departmentForSlug(assignedRole?.departmentSlug ?? fallbackRole?.departmentSlug ?? null, catalog);

  const source: RoleResolutionSource = assignedRole
    ? "assigned"
    : fallbackKey
      ? "auth_role_fallback"
      : "unassigned";

  return {
    businessRoleId: role?.id ?? null,
    businessRoleKey: roleKey,
    businessRoleName: role?.name ?? fallbackRole?.name ?? null,
    departmentId: department?.id ?? profile?.department_id ?? null,
    departmentSlug: department?.slug ?? null,
    departmentName:
      department?.name ??
      profile?.department ??
      departmentNameForSlug(fallbackRole?.departmentSlug ?? null),
    source,
  };
}

function findAssignedRole(
  businessRoles: ExperienceCatalog["businessRoles"],
  businessRoleId: string | null,
) {
  if (!businessRoleId) return null;
  return businessRoles.find((role) => role.id === businessRoleId) ?? null;
}

function findAssignedDepartment(
  catalog: Pick<ExperienceCatalog, "departments">,
  departmentId: string | null,
) {
  if (!departmentId) return null;
  return catalog.departments.find((department) => department.id === departmentId) ?? null;
}

function departmentForSlug(
  slug: string | null,
  catalog: Pick<ExperienceCatalog, "departments">,
) {
  if (!slug) return null;
  return catalog.departments.find((department) => department.slug === slug) ?? null;
}

/** A short, readable label for the assignment source, for the shell and preview. */
export function assignmentSourceLabel(source: RoleResolutionSource) {
  switch (source) {
    case "assigned":
      return "Assigned business role";
    case "auth_role_fallback":
      return "No business role assigned — showing the fallback for this security role";
    default:
      return "No business role assigned — showing the baseline experience";
  }
}
