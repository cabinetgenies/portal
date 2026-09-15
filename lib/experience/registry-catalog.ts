import { BUSINESS_ROLES, OFFICIAL_DEPARTMENTS } from "@/lib/business/catalog";
import type {
  BusinessRoleRecord,
  DepartmentRecord,
  ExperienceCatalog,
} from "@/lib/experience/catalog-types";
import { registryExperienceConfiguration } from "@/lib/experience/config";

/**
 * The catalog as the code registry describes it.
 *
 * Used when the role experience tables cannot be read — a deployment whose Phase 5
 * migration has not been applied, or local development with no Supabase configured
 * at all — so the shell, the role detail page and the preview all still work. The
 * ids are synthetic (`registry-role-sales_designer`), which is exactly why the admin
 * screens turn read-only in this mode: there is nothing to write to.
 *
 * Lives outside the query module so it can be used in tests without pulling in the
 * Supabase client or the Next.js request context.
 */
export function registryExperienceCatalog(note: string | null = null): ExperienceCatalog {
  const departments = OFFICIAL_DEPARTMENTS.map<DepartmentRecord>((department) => ({
    id: `registry-department-${department.slug}`,
    slug: department.slug,
    name: department.name,
    description: department.description,
    ownerProfileId: null,
    active: true,
    displayOrder: department.displayOrder,
  }));

  const departmentBySlug = new Map(departments.map((department) => [department.slug, department]));

  const businessRoles = BUSINESS_ROLES.map<BusinessRoleRecord>((role) => {
    const department = role.departmentSlug ? departmentBySlug.get(role.departmentSlug) : undefined;

    return {
      id: `registry-role-${role.key}`,
      key: role.key,
      name: role.name,
      description: role.description,
      departmentId: department?.id ?? null,
      departmentSlug: department?.slug ?? null,
      departmentName: department?.name ?? null,
      isSystem: role.isSystem,
      active: true,
      displayOrder: role.displayOrder,
    };
  });

  return {
    source: "registry",
    note,
    departments,
    businessRoles,
    configuration: registryExperienceConfiguration(),
  };
}
