import type { Role } from "@/lib/permissions/roles";

/**
 * Department and business-role catalog, plus the default role experiences.
 *
 * The same defaults are seeded by
 * `supabase/migrations/20260915230200_seed_business_architecture.sql`. They are
 * repeated here because the application must still resolve a sensible experience
 * for a profile when the Phase 5 migration has not been applied yet — and because
 * the resolver takes configuration as data, which is what makes it testable
 * without a database.
 */

export type DepartmentDefinition = {
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
};

/** The ten official departments. Slug is the stable key; the name may be edited. */
export const OFFICIAL_DEPARTMENTS: readonly DepartmentDefinition[] = [
  {
    slug: "marketing",
    name: "Marketing",
    description: "Brand, lead generation and market presence.",
    displayOrder: 10,
  },
  {
    slug: "sales",
    name: "Sales",
    description: "Lead qualification, design consultations and sold projects.",
    displayOrder: 20,
  },
  {
    slug: "design",
    name: "Design",
    description: "Design development, drawings and specifications.",
    displayOrder: 30,
  },
  {
    slug: "estimating",
    name: "Estimating",
    description: "Take-off, pricing and estimate preparation.",
    displayOrder: 40,
  },
  {
    slug: "purchasing",
    name: "Purchasing",
    description: "Supplier orders, procurement and vendor coordination.",
    displayOrder: 50,
  },
  {
    slug: "warehousing",
    name: "Warehousing",
    description: "Receiving, storage, staging and material handling.",
    displayOrder: 60,
  },
  {
    slug: "project-management",
    name: "Project Management",
    description: "Project handoff, scheduling and delivery.",
    displayOrder: 70,
  },
  {
    slug: "field-management",
    name: "Field Management",
    description: "Installation crews, site supervision and field support.",
    displayOrder: 80,
  },
  {
    slug: "bookkeeping",
    name: "Bookkeeping",
    description: "Accounting, payables, payroll support and commissions.",
    displayOrder: 90,
  },
  {
    slug: "office-management",
    name: "Office Management",
    description: "Office operations, administration and internal support.",
    displayOrder: 100,
  },
];

export const DEPARTMENT_BY_SLUG = new Map(
  OFFICIAL_DEPARTMENTS.map((department) => [department.slug, department]),
);

export type BusinessRoleDefinition = {
  key: string;
  name: string;
  description: string;
  /** The department the role normally belongs to. Null means company-wide. */
  departmentSlug: string | null;
  isSystem: boolean;
  displayOrder: number;
};

/**
 * The initial business role catalog: the experience a person's app takes, not a
 * security role. It is data — adding "Estimator II" later is configuration, not a
 * code change — and this list is not assumed to be permanently complete.
 */
export const BUSINESS_ROLES: readonly BusinessRoleDefinition[] = [
  {
    key: "ceo",
    name: "CEO",
    description:
      "Company-wide view of every operating module and every configuration surface.",
    departmentSlug: null,
    isSystem: true,
    displayOrder: 10,
  },
  {
    key: "admin",
    name: "Admin",
    description:
      "Portal administration: users, departments, roles, role experiences and settings.",
    departmentSlug: null,
    isSystem: true,
    displayOrder: 20,
  },
  {
    key: "sales_leader",
    name: "Sales Leader",
    description: "Owns the sales pipeline and the sales team's commission outcomes.",
    departmentSlug: "sales",
    isSystem: false,
    displayOrder: 30,
  },
  {
    key: "sales_designer",
    name: "Sales Designer",
    description: "Sells and designs: own projects and own commission position.",
    departmentSlug: "sales",
    isSystem: false,
    displayOrder: 40,
  },
  {
    key: "designer",
    name: "Designer",
    description: "Design development for projects in delivery.",
    departmentSlug: "design",
    isSystem: false,
    displayOrder: 50,
  },
  {
    key: "estimator",
    name: "Estimator",
    description: "Estimates and pricing for projects in the pipeline.",
    departmentSlug: "estimating",
    isSystem: false,
    displayOrder: 60,
  },
  {
    key: "purchasing",
    name: "Purchasing",
    description: "Procurement and vendor coordination for active projects.",
    departmentSlug: "purchasing",
    isSystem: false,
    displayOrder: 70,
  },
  {
    key: "warehouse",
    name: "Warehouse",
    description: "Receiving, staging and material movement.",
    departmentSlug: "warehousing",
    isSystem: false,
    displayOrder: 80,
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Owns project delivery from handoff to completion.",
    departmentSlug: "project-management",
    isSystem: false,
    displayOrder: 90,
  },
  {
    key: "field_manager",
    name: "Field Manager",
    description: "Owns crews and field execution on site.",
    departmentSlug: "field-management",
    isSystem: false,
    displayOrder: 100,
  },
  {
    key: "bookkeeping",
    name: "Bookkeeping",
    description: "Financial processing, including commission approval and payment.",
    departmentSlug: "bookkeeping",
    isSystem: false,
    displayOrder: 110,
  },
  {
    key: "office_manager",
    name: "Office Manager",
    description: "Office operations and internal support.",
    departmentSlug: "office-management",
    isSystem: false,
    displayOrder: 120,
  },
];

export const BUSINESS_ROLE_BY_KEY = new Map(BUSINESS_ROLES.map((role) => [role.key, role]));

export const BUSINESS_ROLE_KEYS: readonly string[] = BUSINESS_ROLES.map((role) => role.key);

export function businessRoleDefinition(key: string | null | undefined) {
  if (!key) return null;
  return BUSINESS_ROLE_BY_KEY.get(key) ?? null;
}

export function departmentNameForSlug(slug: string | null) {
  if (!slug) return null;
  return DEPARTMENT_BY_SLUG.get(slug)?.name ?? null;
}

/**
 * The experience an unassigned profile gets.
 *
 * Every portal user has a security role, but business-role assignment is new, so
 * an existing account may not have one yet. Rather than rendering an empty app,
 * an unassigned person gets the non-sensitive baseline — Home, Requests, People
 * and Knowledge — and the shell says plainly that no business role is assigned.
 * It is the smallest experience that is still useful, and it exposes nothing
 * gated: Commissions and Admin are absent, and the routes behind them re-check
 * their own capabilities regardless.
 */
export const BASE_EXPERIENCE_MODULE_KEYS: readonly string[] = [
  "home",
  "requests",
  "people",
  "knowledge",
];

export const BASE_EXPERIENCE_WIDGET_KEYS: readonly string[] = [
  "my_requests",
  "training_due",
];

export const BASE_EXPERIENCE_QUICK_ACTION_KEYS: readonly string[] = [
  "submit_request",
  "open_knowledge",
];

/**
 * Until every profile has a business role assigned, the existing security role
 * gives a reasonable approximation of the experience — a CEO still sees the
 * company, an accountant still sees the finance queue. `employee` deliberately
 * maps to nothing: it is the generic bucket, and guessing a business role for it
 * would be worse than being explicit about the missing assignment.
 */
export const FALLBACK_ROLE_KEY_BY_AUTH_ROLE: Record<Role, string | null> = {
  ceo: "ceo",
  admin: "admin",
  accounting: "bookkeeping",
  supervisor: "project_manager",
  employee: null,
};

export type DefaultRoleExperience = {
  moduleKeys: readonly string[];
  emphasizedModuleKeys: readonly string[];
  widgets: readonly { key: string; span: number }[];
  quickActionKeys: readonly string[];
};

/** Every module key, in navigation order. Used by the company-wide roles. */
export const ALL_MODULE_KEYS: readonly string[] = [
  "home",
  "sales",
  "projects",
  "commissions",
  "requests",
  "people",
  "performance",
  "inventory",
  "operations",
  "knowledge",
  "admin",
];

/**
 * Default role experiences.
 *
 * Role inheritance is expressed with `allModules` for the two company-wide roles
 * instead of listing ten modules twice, and the rest mirror the seed migration
 * exactly. These are defaults only — nothing here is immutable, and the admin role
 * editor writes the same shapes.
 */
export const DEFAULT_ROLE_EXPERIENCES: Readonly<Record<string, DefaultRoleExperience>> = {
  ceo: {
    moduleKeys: ALL_MODULE_KEYS,
    emphasizedModuleKeys: [],
    widgets: [
      { key: "company_activity", span: 2 },
      { key: "leadership_attention", span: 2 },
      { key: "commission_summary", span: 1 },
      { key: "inventory_alerts", span: 1 },
      { key: "projects_at_risk", span: 1 },
      { key: "department_health", span: 1 },
    ],
    quickActionKeys: [
      "review_approvals",
      "manage_users",
      "manage_roles",
      "view_role_experiences",
      "company_settings",
    ],
  },
  admin: {
    moduleKeys: ALL_MODULE_KEYS,
    emphasizedModuleKeys: [],
    widgets: [
      { key: "company_activity", span: 2 },
      { key: "leadership_attention", span: 2 },
      { key: "commission_summary", span: 1 },
      { key: "my_approvals", span: 1 },
      { key: "inventory_alerts", span: 1 },
      { key: "department_health", span: 1 },
    ],
    quickActionKeys: [
      "manage_users",
      "manage_roles",
      "view_role_experiences",
      "company_settings",
      "review_approvals",
    ],
  },
  sales_leader: {
    moduleKeys: [
      "home",
      "sales",
      "projects",
      "commissions",
      "requests",
      "people",
      "performance",
      "knowledge",
    ],
    emphasizedModuleKeys: ["sales", "commissions"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "commission_summary", span: 1 },
      { key: "my_approvals", span: 1 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["view_commissions", "view_projects", "submit_request"],
  },
  sales_designer: {
    moduleKeys: ["home", "sales", "projects", "commissions", "requests", "people", "knowledge"],
    emphasizedModuleKeys: ["sales", "commissions"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "projected_commission", span: 1 },
      { key: "pending_commission", span: 1 },
      { key: "ready_to_pay", span: 1 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: [
      "view_commissions",
      "view_projects",
      "submit_request",
      "open_knowledge",
    ],
  },
  designer: {
    moduleKeys: ["home", "projects", "requests", "people", "knowledge"],
    emphasizedModuleKeys: ["projects"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["view_projects", "submit_request", "open_knowledge"],
  },
  estimator: {
    moduleKeys: ["home", "projects", "requests", "knowledge"],
    emphasizedModuleKeys: ["projects"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["view_projects", "submit_request", "open_knowledge"],
  },
  purchasing: {
    moduleKeys: ["home", "projects", "requests", "inventory", "knowledge"],
    emphasizedModuleKeys: ["projects", "inventory"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "inventory_alerts", span: 1 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["view_projects", "open_inventory", "submit_request"],
  },
  warehouse: {
    moduleKeys: ["home", "requests", "inventory", "knowledge"],
    emphasizedModuleKeys: ["inventory"],
    widgets: [
      { key: "inventory_alerts", span: 2 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["open_inventory", "submit_request", "open_knowledge"],
  },
  project_manager: {
    moduleKeys: ["home", "projects", "requests", "people", "operations", "knowledge"],
    emphasizedModuleKeys: ["projects", "operations"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "my_requests", span: 1 },
      { key: "my_approvals", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["view_projects", "submit_request", "open_knowledge"],
  },
  field_manager: {
    moduleKeys: ["home", "projects", "requests", "operations", "knowledge"],
    emphasizedModuleKeys: ["projects", "operations"],
    widgets: [
      { key: "my_projects", span: 2 },
      { key: "my_requests", span: 1 },
      { key: "my_approvals", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["view_projects", "submit_request", "open_knowledge"],
  },
  bookkeeping: {
    moduleKeys: ["home", "requests", "people", "knowledge"],
    emphasizedModuleKeys: ["requests"],
    widgets: [
      { key: "my_approvals", span: 2 },
      { key: "commission_summary", span: 1 },
      { key: "my_requests", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["update_financials", "review_approvals", "submit_request"],
  },
  office_manager: {
    moduleKeys: ["home", "requests", "people", "knowledge"],
    emphasizedModuleKeys: ["requests"],
    widgets: [
      { key: "my_requests", span: 2 },
      { key: "my_approvals", span: 1 },
      { key: "department_health", span: 1 },
      { key: "training_due", span: 1 },
    ],
    quickActionKeys: ["submit_request", "view_people", "open_knowledge"],
  },
};

/** The default experience for a role key, or null when the role is not seeded. */
export function defaultRoleExperience(roleKey: string | null | undefined) {
  if (!roleKey) return null;
  return DEFAULT_ROLE_EXPERIENCES[roleKey] ?? null;
}
