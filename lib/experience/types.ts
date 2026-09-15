import type { Capability } from "@/lib/permissions/roles";
import type { NavIconKey } from "@/lib/permissions/navigation";
import type { ModuleNavSection } from "@/lib/supabase/database.types";

/**
 * The role experience model.
 *
 * Three concepts stay separate on purpose, and the separation is the whole point
 * of this module:
 *
 *   Department    where an employee belongs              (data: departments)
 *   Business role what their app experience looks like   (data: business_roles)
 *   Capability    what they are allowed to access or do  (code + RLS)
 *
 * A role experience is assembled from configuration. It never grants access:
 * every module route re-checks its capability server-side and Postgres enforces
 * Row Level Security regardless of what is configured here.
 */

export type AppModuleDefinition = {
  /** Database id when the definition came from the registry table. */
  id?: string;
  key: string;
  slug: string;
  name: string;
  description: string;
  href: string;
  iconKey: NavIconKey;
  navSection: ModuleNavSection;
  displayOrder: number;
  isActive: boolean;
};

export type DashboardWidgetDefinition = {
  key: string;
  name: string;
  description: string;
  componentKey: string;
  isActive: boolean;
  displayOrder: number;
};

export type QuickActionDefinition = {
  key: string;
  label: string;
  description: string;
  href: string | null;
  actionKey: string | null;
  iconKey: NavIconKey | null;
  isActive: boolean;
  displayOrder: number;
};

export type RoleModuleAssignment = {
  moduleKey: string;
  isVisible: boolean;
  isEmphasized: boolean;
  isDefaultLanding: boolean;
  displayOrder: number;
};

export type RoleWidgetAssignment = {
  widgetKey: string;
  isVisible: boolean;
  span: number;
  displayOrder: number;
};

export type RoleQuickActionAssignment = {
  actionKey: string;
  isVisible: boolean;
  displayOrder: number;
};

/**
 * One complete experience configuration.
 *
 * `roleModules`, `roleWidgets` and `roleActions` are keyed by business role key
 * and hold every role, so one load serves the shell, a role detail page and the
 * admin preview without re-querying per role.
 */
export type ExperienceConfiguration = {
  /** Where the configuration came from: the database, or the code registry. */
  source: "database" | "registry";
  modules: readonly AppModuleDefinition[];
  widgets: readonly DashboardWidgetDefinition[];
  actions: readonly QuickActionDefinition[];
  roleModules: Readonly<Record<string, readonly RoleModuleAssignment[]>>;
  roleWidgets: Readonly<Record<string, readonly RoleWidgetAssignment[]>>;
  roleActions: Readonly<Record<string, readonly RoleQuickActionAssignment[]>>;
};

/** How the signed-in person's business role was resolved. */
export type RoleResolutionSource = "assigned" | "auth_role_fallback" | "unassigned";

export type ResolvedModule = AppModuleDefinition & {
  /** True when the role's configuration shows it. */
  isVisible: boolean;
  isEmphasized: boolean;
  isDefaultLanding: boolean;
  /** True when the person's capabilities satisfy the module's requirement. */
  isAllowed: boolean;
};

export type ResolvedWidget = DashboardWidgetDefinition & {
  isVisible: boolean;
  span: number;
};

export type ResolvedQuickAction = QuickActionDefinition & {
  isVisible: boolean;
};

export type KnowledgeScope = {
  roleKey: string | null;
  departmentSlug: string | null;
};

export type RoleExperience = {
  roleKey: string | null;
  roleName: string;
  roleDescription: string | null;
  departmentSlug: string | null;
  departmentName: string | null;
  resolutionSource: RoleResolutionSource;
  /** Visible AND allowed. This is what the shell renders. */
  modules: readonly ResolvedModule[];
  /** Configured visible but filtered out by capabilities. Never rendered. */
  blockedModules: readonly ResolvedModule[];
  /** Configured hidden. Kept so an administrator can see the decision. */
  hiddenModules: readonly ResolvedModule[];
  landingHref: string;
  widgets: readonly ResolvedWidget[];
  quickActions: readonly ResolvedQuickAction[];
  knowledgeScope: KnowledgeScope;
};

/** Capability requirements for a module or quick action, in code. */
export type CapabilityRequirement = readonly Capability[];
