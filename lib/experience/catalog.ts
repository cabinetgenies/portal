import type {
  AppModuleDefinition,
  DashboardWidgetDefinition,
  QuickActionDefinition,
} from "@/lib/experience/types";

/**
 * The code registry.
 *
 * The database is the runtime source of truth for configuration, but the catalog
 * itself lives here as well, for three reasons:
 *
 *   1. A deployment whose Phase 5 migration has not been applied yet still gets a
 *      correct, complete navigation instead of an empty shell.
 *   2. The seed migration and this file describe the same modules and actions, and
 *      the unit tests check the important invariants (every role experience only
 *      references modules that exist, every module has a route, and so on).
 *   3. `key` is a contract. A module or action exists in code — with a route, an
 *      icon and a capability rule — or it does not exist at all. That is what
 *      stops a configuration row from pointing at a screen nobody built.
 *
 * Capability requirements are NOT here: they live in
 * lib/permissions/module-capabilities.ts, because authorization must never be
 * editable through experience configuration.
 */

export const CORE_MODULES: readonly AppModuleDefinition[] = [
  {
    key: "home",
    slug: "home",
    name: "Home",
    description: "Your role-aware dashboard: what needs your attention today.",
    href: "/home",
    iconKey: "dashboard",
    navSection: "primary",
    displayOrder: 10,
    isActive: true,
  },
  {
    key: "sales",
    slug: "sales",
    name: "Sales",
    description: "Sales overview, pipeline entry points and the commission sub-app.",
    href: "/sales",
    iconKey: "sales",
    navSection: "primary",
    displayOrder: 20,
    isActive: true,
  },
  {
    key: "projects",
    slug: "projects",
    name: "Projects",
    description:
      "Project and job records the portal owns, with Buildertrend remaining the execution system of record.",
    href: "/projects",
    iconKey: "projects",
    navSection: "primary",
    displayOrder: 30,
    isActive: true,
  },
  {
    key: "commissions",
    slug: "commissions",
    name: "Commissions",
    description: "Commission jobs, projection, approval and payment.",
    href: "/sales/commissions",
    iconKey: "commissions",
    navSection: "primary",
    displayOrder: 40,
    isActive: true,
  },
  {
    key: "requests",
    slug: "requests",
    name: "Requests & Approvals",
    description: "Internal requests and the approvals they need.",
    href: "/requests",
    iconKey: "requests",
    navSection: "primary",
    displayOrder: 50,
    isActive: true,
  },
  {
    key: "people",
    slug: "people",
    name: "People",
    description: "The team, their departments, roles and reporting lines.",
    href: "/people",
    iconKey: "people",
    navSection: "primary",
    displayOrder: 60,
    isActive: true,
  },
  {
    key: "performance",
    slug: "performance",
    name: "Performance & Leadership",
    description: "Scorecards, quarterly priorities, meetings, issues, actions and reviews.",
    href: "/performance",
    iconKey: "performance",
    navSection: "primary",
    displayOrder: 65,
    isActive: true,
  },
  {
    key: "inventory",
    slug: "inventory",
    name: "Inventory",
    description: "Items, receiving, allocations, adjustments and stock levels.",
    href: "/inventory",
    iconKey: "inventory",
    navSection: "primary",
    displayOrder: 70,
    isActive: true,
  },
  {
    key: "operations",
    slug: "operations",
    name: "Operations",
    description:
      "Department operational support that does not belong in Buildertrend.",
    href: "/operations",
    iconKey: "operations",
    navSection: "primary",
    displayOrder: 80,
    isActive: true,
  },
  {
    key: "knowledge",
    slug: "knowledge",
    name: "Knowledge",
    description: "BOS: training, SOPs, role expectations, playbooks, forms and policies.",
    href: "/knowledge",
    iconKey: "knowledge",
    navSection: "support",
    displayOrder: 90,
    isActive: true,
  },
  {
    key: "admin",
    slug: "admin",
    name: "Admin",
    description: "Users, departments, roles, role experiences and portal settings.",
    href: "/admin",
    iconKey: "admin",
    navSection: "admin",
    displayOrder: 100,
    isActive: true,
  },
];

export const MODULE_BY_KEY = new Map(CORE_MODULES.map((module) => [module.key, module]));

export const MODULE_KEYS: readonly string[] = CORE_MODULES.map((module) => module.key);

export function moduleDefinition(key: string) {
  return MODULE_BY_KEY.get(key) ?? null;
}

/** Left-to-right order of the navigation sections, primary app first. */
export const NAV_SECTION_ORDER = ["primary", "support", "admin"] as const;

export const NAV_SECTION_LABELS: Record<(typeof NAV_SECTION_ORDER)[number], string> = {
  primary: "Operating",
  support: "Support",
  admin: "Administration",
};

/**
 * The widget catalog. `componentKey` names a renderer, and several widgets
 * deliberately share one: the three commission widgets are the same amount
 * renderer over different data, and the attention widgets are one list renderer.
 * That is what keeps this a reusable dashboard instead of one component per role.
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetDefinition[] = [
  {
    key: "my_projects",
    name: "My projects",
    description: "The signed-in person's projects and their current status.",
    componentKey: "projects_summary",
    isActive: true,
    displayOrder: 10,
  },
  {
    key: "projected_commission",
    name: "Projected commission",
    description: "Commission projected on the person's own jobs.",
    componentKey: "commission_amount",
    isActive: true,
    displayOrder: 20,
  },
  {
    key: "pending_commission",
    name: "Pending commission",
    description: "Commission awaiting approval.",
    componentKey: "commission_amount",
    isActive: true,
    displayOrder: 30,
  },
  {
    key: "ready_to_pay",
    name: "Ready to pay",
    description: "Approved commission that has not been paid yet.",
    componentKey: "commission_amount",
    isActive: true,
    displayOrder: 40,
  },
  {
    key: "commission_summary",
    name: "Commission summary",
    description: "Company-wide commission position.",
    componentKey: "metric_summary",
    isActive: true,
    displayOrder: 50,
  },
  {
    key: "my_requests",
    name: "My requests",
    description: "Requests this person has raised and where they stand.",
    componentKey: "attention_list",
    isActive: true,
    displayOrder: 60,
  },
  {
    key: "my_approvals",
    name: "My approvals",
    description: "Items waiting on this person's decision.",
    componentKey: "attention_list",
    isActive: true,
    displayOrder: 70,
  },
  {
    key: "training_due",
    name: "Training due",
    description: "Role training that is due or overdue.",
    componentKey: "attention_list",
    isActive: true,
    displayOrder: 80,
  },
  {
    key: "inventory_alerts",
    name: "Inventory alerts",
    description: "Low stock and receiving exceptions.",
    componentKey: "attention_list",
    isActive: true,
    displayOrder: 90,
  },
  {
    key: "leadership_attention",
    name: "Leadership attention",
    description: "Items the leadership team should look at.",
    componentKey: "attention_list",
    isActive: true,
    displayOrder: 100,
  },
  {
    key: "projects_at_risk",
    name: "Projects at risk",
    description: "Projects whose schedule or margin needs attention.",
    componentKey: "metric_summary",
    isActive: true,
    displayOrder: 110,
  },
  {
    key: "department_health",
    name: "Department health",
    description: "Workload and delivery health by department.",
    componentKey: "metric_summary",
    isActive: true,
    displayOrder: 120,
  },
  {
    key: "company_activity",
    name: "Company activity",
    description: "Recent audited changes across the portal.",
    componentKey: "activity_feed",
    isActive: true,
    displayOrder: 130,
  },
];

export const WIDGET_BY_KEY = new Map(DASHBOARD_WIDGETS.map((widget) => [widget.key, widget]));

/**
 * The quick action catalog.
 *
 * An action is either a navigation (`href`) or a named operation (`actionKey`).
 * Planned actions — receiving, adjustments, handoff review, document upload and
 * Buildertrend — are catalogued inactive: they document the intent without
 * pointing anyone at a screen that does not exist.
 */
export const QUICK_ACTIONS: readonly QuickActionDefinition[] = [
  {
    key: "new_project",
    label: "New Project",
    description: "Create a new project record.",
    href: "/projects/new",
    actionKey: null,
    iconKey: "projects",
    isActive: true,
    displayOrder: 10,
  },
  {
    key: "view_projects",
    label: "View Projects",
    description: "Open the project list.",
    href: "/projects",
    actionKey: null,
    iconKey: "projects",
    isActive: true,
    displayOrder: 20,
  },
  {
    key: "view_commissions",
    label: "View Commissions",
    description: "Open commissions.",
    href: "/sales/commissions",
    actionKey: null,
    iconKey: "commissions",
    isActive: true,
    displayOrder: 30,
  },
  {
    key: "review_approvals",
    label: "Review Approvals",
    description: "Open the approval and payment queue.",
    href: "/sales/commissions/payments",
    actionKey: null,
    iconKey: "commissions",
    isActive: true,
    displayOrder: 40,
  },
  {
    key: "update_financials",
    label: "Update Financials",
    description: "Enter or correct a project's financial inputs.",
    // Financial inputs live on the project record, so the action opens the shared
    // project list rather than a commission-owned copy of it.
    href: "/projects",
    actionKey: null,
    iconKey: "commissions",
    isActive: true,
    displayOrder: 50,
  },
  {
    key: "submit_request",
    label: "Submit Request",
    description: "Raise a request for someone to action.",
    href: "/requests",
    actionKey: null,
    iconKey: "requests",
    isActive: true,
    displayOrder: 60,
  },
  {
    key: "view_people",
    label: "View People",
    description: "Open the people directory.",
    href: "/people",
    actionKey: null,
    iconKey: "people",
    isActive: true,
    displayOrder: 70,
  },
  {
    key: "open_inventory",
    label: "Open Inventory",
    description: "Open the inventory module.",
    href: "/inventory",
    actionKey: null,
    iconKey: "inventory",
    isActive: true,
    displayOrder: 80,
  },
  {
    key: "open_knowledge",
    label: "Open Knowledge",
    description: "Open BOS: training, SOPs and playbooks.",
    href: "/knowledge",
    actionKey: null,
    iconKey: "knowledge",
    isActive: true,
    displayOrder: 90,
  },
  {
    key: "manage_users",
    label: "Manage Users",
    description: "Add users and change roles, departments and reporting lines.",
    href: "/admin/users",
    actionKey: null,
    iconKey: "admin",
    isActive: true,
    displayOrder: 100,
  },
  {
    key: "manage_roles",
    label: "Manage Roles",
    description: "Configure what each business role sees.",
    href: "/admin/roles",
    actionKey: null,
    iconKey: "admin",
    isActive: true,
    displayOrder: 110,
  },
  {
    key: "view_role_experiences",
    label: "View Role Experiences",
    description: "Preview any role's system read-only.",
    href: "/admin/role-experiences",
    actionKey: null,
    iconKey: "admin",
    isActive: true,
    displayOrder: 120,
  },
  {
    key: "company_settings",
    label: "Company Settings",
    description: "Portal and company-level settings.",
    href: "/admin/settings",
    actionKey: null,
    iconKey: "admin",
    isActive: true,
    displayOrder: 130,
  },
  {
    key: "receive_inventory",
    label: "Receive Inventory",
    description: "Receive a delivery into stock. Not built yet.",
    href: null,
    actionKey: "receive_inventory",
    iconKey: "inventory",
    isActive: false,
    displayOrder: 140,
  },
  {
    key: "adjust_inventory",
    label: "Adjust Inventory",
    description: "Adjust stock with a reason. Not built yet.",
    href: null,
    actionKey: "adjust_inventory",
    iconKey: "inventory",
    isActive: false,
    displayOrder: 150,
  },
  {
    key: "review_handoff",
    label: "Review Handoff",
    description: "Review a sales-to-delivery handoff. Not built yet.",
    href: null,
    actionKey: "review_handoff",
    iconKey: "operations",
    isActive: false,
    displayOrder: 160,
  },
  {
    key: "upload_document",
    label: "Upload Document",
    description: "Attach a document to a record. Not built yet.",
    href: null,
    actionKey: "upload_document",
    iconKey: "knowledge",
    isActive: false,
    displayOrder: 170,
  },
  {
    key: "open_buildertrend",
    label: "Open Buildertrend",
    description:
      "Jump to Buildertrend, which stays the execution system of record. No URL is configured yet.",
    href: null,
    actionKey: "open_buildertrend",
    iconKey: "operations",
    isActive: false,
    displayOrder: 180,
  },
];

export const QUICK_ACTION_BY_KEY = new Map(
  QUICK_ACTIONS.map((action) => [action.key, action]),
);
