import type { Capability } from "@/lib/permissions/roles";

/**
 * Capability requirements for modules and quick actions — deliberately in code.
 *
 * Role experience configuration is editable by administrators, so it must never
 * be able to widen access. If a "required capability" lived in
 * `app_modules`/`quick_actions`, an administrator could set it to null and turn a
 * cosmetic change into an authorization change. Keeping the requirement in code
 * means the worst a misconfigured experience can do is show a link to a page that
 * then refuses the request — and Row Level Security refuses the data regardless.
 *
 * An entry is satisfied when the person holds **any** of the listed capabilities.
 * An empty list means "no capability required".
 */

export const MODULE_CAPABILITIES: Readonly<Record<string, readonly Capability[]>> = {
  home: [],
  sales: [],
  projects: [],
  // Commission data is served through several capabilities depending on who you
  // are: an employee reads their own commission, accounting and administrators
  // work with everyone's. Any of them opens the module.
  commissions: [
    "view:own-commission",
    "view:financials",
    "calculate:commission",
    "submit:commission",
    "approve:commission",
    "pay:commission",
  ],
  requests: [],
  people: [],
  performance: [
    "view:performance-own",
    "view:performance-team",
    "view:performance-all",
    "manage:performance",
  ],
  inventory: [],
  operations: [],
  knowledge: [],
  admin: ["administer:portal"],
};

export const QUICK_ACTION_CAPABILITIES: Readonly<Record<string, readonly Capability[]>> = {
  new_project: ["manage:jobs"],
  view_projects: [],
  view_commissions: ["view:own-commission", "view:financials"],
  review_approvals: ["approve:commission"],
  update_financials: ["edit:job-financials"],
  submit_request: [],
  view_people: [],
  open_inventory: [],
  open_knowledge: [],
  receive_inventory: [],
  adjust_inventory: [],
  manage_users: ["administer:portal"],
  manage_roles: ["administer:portal"],
  view_role_experiences: ["administer:portal"],
  company_settings: ["administer:portal"],
  review_handoff: [],
  upload_document: [],
  open_buildertrend: [],
};

export function capabilitySatisfied(
  required: readonly Capability[],
  held: readonly Capability[],
) {
  if (required.length === 0) return true;
  return required.some((capability) => held.includes(capability));
}

export function moduleCapabilities(moduleKey: string): readonly Capability[] {
  return MODULE_CAPABILITIES[moduleKey] ?? [];
}

export function quickActionCapabilities(actionKey: string): readonly Capability[] {
  return QUICK_ACTION_CAPABILITIES[actionKey] ?? [];
}
