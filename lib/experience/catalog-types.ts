/**
 * Shapes the experience read layer shares with the pure resolver and the pages.
 * Kept apart from the query module so a component or a test can import the types
 * without pulling in the Supabase client.
 */

export type DepartmentRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  ownerProfileId: string | null;
  active: boolean;
  displayOrder: number;
};

export type BusinessRoleRecord = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentSlug: string | null;
  departmentName: string | null;
  isSystem: boolean;
  active: boolean;
  displayOrder: number;
};

export type ExperienceCatalog = {
  /** Where the whole snapshot came from. */
  source: "database" | "registry";
  /** Set when the registry fallback was used, explaining why. */
  note: string | null;
  departments: readonly DepartmentRecord[];
  businessRoles: readonly BusinessRoleRecord[];
  configuration: import("@/lib/experience/types").ExperienceConfiguration;
};
