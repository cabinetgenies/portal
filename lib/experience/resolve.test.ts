import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_ROLE_EXPERIENCES } from "@/lib/business/catalog";
import { CORE_MODULES, DASHBOARD_WIDGETS, QUICK_ACTIONS } from "@/lib/experience/catalog";
import { registryExperienceConfiguration } from "@/lib/experience/config";
import {
  landingHrefFor,
  resolveModules,
  resolveQuickActions,
  resolveWidgets,
  roleExperienceFor,
} from "@/lib/experience/resolve";
import type { ExperienceConfiguration } from "@/lib/experience/types";
import { moduleCapabilities, capabilitySatisfied } from "@/lib/permissions/module-capabilities";
import { isNavIconKey } from "@/lib/permissions/navigation";
import { capabilitiesFor, normalizeRole, type Role } from "@/lib/permissions/roles";

/**
 * The role experience resolver, tested as configuration in and experience out.
 *
 * These are the tests the phase asks for: a role resolves to modules, widgets and
 * quick actions; a hidden module really is hidden; and — the one that matters most —
 * hiding or showing a module never changes what a person is allowed to do.
 */

function experienceFor(roleKey: string, role: Role, configuration?: ExperienceConfiguration) {
  return roleExperienceFor({
    roleKey,
    resolutionSource: "assigned",
    capabilities: capabilitiesFor(role),
    configuration: configuration ?? registryExperienceConfiguration(),
  });
}

function hrefsFor(roleKey: string, role: Role) {
  return experienceFor(roleKey, role).modules.map((module) => module.href);
}

test("the module registry loads correctly", () => {
  const keys = CORE_MODULES.map((module) => module.key);
  const slugs = CORE_MODULES.map((module) => module.slug);

  assert.equal(new Set(keys).size, keys.length, "module keys are unique");
  assert.equal(new Set(slugs).size, slugs.length, "module slugs are unique");

  for (const definition of CORE_MODULES) {
    assert.ok(definition.href.startsWith("/"), `${definition.key} must have an application path`);
    assert.ok(isNavIconKey(definition.iconKey), `${definition.key} must use a known icon key`);
    assert.ok(definition.name.length > 0 && definition.description.length > 0);
  }

  assert.deepEqual(keys.slice(0, 4), ["home", "sales", "projects", "commissions"]);
  assert.ok(keys.includes("knowledge"), "BOS/Knowledge is a registered module");
  assert.equal(
    CORE_MODULES.find((definition) => definition.key === "knowledge")?.navSection,
    "support",
    "Knowledge is secondary content, not part of the operating set",
  );
});

test("every default role experience only references registered items", () => {
  const moduleKeys = new Set(CORE_MODULES.map((module) => module.key));
  const widgetKeys = new Set(DASHBOARD_WIDGETS.map((widget) => widget.key));
  const actionKeys = new Set(QUICK_ACTIONS.map((action) => action.key));

  for (const [roleKey, experience] of Object.entries(DEFAULT_ROLE_EXPERIENCES)) {
    for (const moduleKey of experience.moduleKeys) {
      assert.ok(moduleKeys.has(moduleKey), `${roleKey} references unknown module ${moduleKey}`);
    }
    for (const widget of experience.widgets) {
      assert.ok(widgetKeys.has(widget.key), `${roleKey} references unknown widget ${widget.key}`);
    }
    for (const actionKey of experience.quickActionKeys) {
      assert.ok(actionKeys.has(actionKey), `${roleKey} references unknown action ${actionKey}`);
    }
  }
});

test("a role's modules resolve in order, and the default landing is Home", () => {
  const experience = experienceFor("project_manager", "supervisor");

  assert.deepEqual(
    experience.modules.map((module) => module.key),
    ["home", "projects", "requests", "people", "operations", "knowledge"],
  );
  assert.equal(experience.landingHref, "/home");
  assert.equal(landingHrefFor([]), "/home", "an empty experience still lands somewhere real");
});

test("module visibility resolves per role, and a hidden module is not in navigation", () => {
  const warehouse = experienceFor("warehouse", "employee");

  assert.ok(warehouse.modules.some((module) => module.key === "inventory"));
  assert.equal(
    warehouse.modules.some((module) => module.key === "sales"),
    false,
    "the Warehouse role does not see Sales",
  );
  assert.ok(
    warehouse.hiddenModules.some((module) => module.key === "sales"),
    "the decision is stored as a hidden module rather than simply being absent",
  );

  // Flip the configuration and the answer changes with it: visibility is data.
  const configuration = registryExperienceConfiguration();
  const inventoryOff = {
    ...configuration,
    roleModules: {
      ...configuration.roleModules,
      warehouse: (configuration.roleModules.warehouse ?? []).map((assignment) =>
        assignment.moduleKey === "inventory" ? { ...assignment, isVisible: false } : assignment,
      ),
    },
  } satisfies ExperienceConfiguration;

  const hidden = experienceFor("warehouse", "employee", inventoryOff);
  assert.equal(hidden.modules.some((module) => module.key === "inventory"), false);
  assert.ok(hidden.hiddenModules.some((module) => module.key === "inventory"));
});

test("hiding a module never bypasses authorization", () => {
  // The configuration is the *only* thing that changes here: no capability list is
  // touched, and the module's requirement is unchanged.
  const configuration = registryExperienceConfiguration();
  const adminVisibleForWarehouse = {
    ...configuration,
    roleModules: {
      ...configuration.roleModules,
      warehouse: [
        ...(configuration.roleModules.warehouse ?? []),
        {
          moduleKey: "admin",
          isVisible: true,
          isEmphasized: false,
          isDefaultLanding: false,
          displayOrder: 999,
        },
      ],
    },
  } satisfies ExperienceConfiguration;

  const employee = experienceFor("warehouse", "employee", adminVisibleForWarehouse);

  // Requested by configuration, refused by capability: it lands in blockedModules,
  // never in modules, and the capability requirement itself is untouched.
  assert.equal(employee.modules.some((module) => module.key === "admin"), false);
  assert.ok(employee.blockedModules.some((module) => module.key === "admin"));
  assert.equal(
    capabilitySatisfied(moduleCapabilities("admin"), capabilitiesFor("employee")),
    false,
    "the admin module requires administer:portal, which an employee does not hold",
  );

  // The same configuration does not block the module for a role that holds the
  // capability — so it is authorization deciding, not the configuration.
  const admin = roleExperienceFor({
    roleKey: "warehouse",
    resolutionSource: "assigned",
    capabilities: capabilitiesFor("admin"),
    configuration: adminVisibleForWarehouse,
  });

  assert.equal(admin.modules.some((module) => module.key === "admin"), true);
  assert.equal(
    capabilitySatisfied(moduleCapabilities("commissions"), capabilitiesFor("employee")),
    true,
    "an employee may read their own commission: that module is gated by a capability they hold",
  );
});

test("dashboard widgets resolve by role", () => {
  const configuration = registryExperienceConfiguration();

  const salesDesigner = experienceFor("sales_designer", "employee", configuration);
  assert.deepEqual(
    salesDesigner.widgets.map((widget) => widget.key),
    [
      "my_projects",
      "projected_commission",
      "pending_commission",
      "ready_to_pay",
      "my_requests",
      "training_due",
    ],
  );

  const projectManager = experienceFor("project_manager", "supervisor", configuration);
  assert.deepEqual(
    projectManager.widgets.map((widget) => widget.key),
    ["my_projects", "my_requests", "my_approvals", "training_due"],
  );

  const ceo = experienceFor("ceo", "ceo", configuration);
  assert.deepEqual(
    ceo.widgets.map((widget) => widget.key),
    [
      "company_activity",
      "leadership_attention",
      "commission_summary",
      "inventory_alerts",
      "projects_at_risk",
      "department_health",
    ],
  );

  // Several widgets share one renderer — that is what keeps this reusable.
  const componentKeys = DASHBOARD_WIDGETS.filter((widget) =>
    ["projected_commission", "pending_commission", "ready_to_pay"].includes(widget.key),
  ).map((widget) => widget.componentKey);

  assert.deepEqual(componentKeys, [
    "commission_amount",
    "commission_amount",
    "commission_amount",
  ]);
});

test("widgets resolve independently of the empty-data state", () => {
  const widgets = resolveWidgets({
    widgets: DASHBOARD_WIDGETS,
    roleWidgets: [
      { widgetKey: "my_projects", isVisible: false, span: 2, displayOrder: 10 },
      { widgetKey: "my_requests", isVisible: true, span: 1, displayOrder: 20 },
    ],
  });

  assert.deepEqual(
    widgets.map((widget) => widget.key),
    ["my_requests"],
  );
});

test("quick actions resolve by role, and capability-gated actions stay hidden", () => {
  const configuration = registryExperienceConfiguration();

  const salesDesigner = experienceFor("sales_designer", "employee", configuration);
  assert.deepEqual(
    salesDesigner.quickActions.map((action) => action.key),
    ["view_commissions", "view_projects", "submit_request", "open_knowledge"],
  );
  assert.equal(
    salesDesigner.quickActions.some((action) => action.key === "update_financials"),
    false,
    "financial editing is an accounting capability and is not offered to a designer",
  );

  const admin = experienceFor("admin", "admin", configuration);
  assert.deepEqual(
    admin.quickActions.map((action) => action.key),
    ["manage_users", "manage_roles", "view_role_experiences", "company_settings", "review_approvals"],
  );

  const bookkeeping = experienceFor("bookkeeping", "accounting", configuration);
  assert.ok(bookkeeping.quickActions.some((action) => action.key === "update_financials"));

  // Actions are filtered through their capability, exactly like modules.
  const blocked = resolveQuickActions({
    actions: QUICK_ACTIONS,
    roleActions: [
      { actionKey: "manage_users", isVisible: true, displayOrder: 10 },
      { actionKey: "view_projects", isVisible: true, displayOrder: 20 },
    ],
    capabilities: capabilitiesFor("employee"),
  });

  assert.deepEqual(
    blocked.map((action) => action.key),
    ["view_projects"],
  );
});

test("inactive quick actions are never offered", () => {
  const offered = QUICK_ACTIONS.filter((action) => action.isActive).map((action) => action.key);

  assert.equal(offered.includes("open_buildertrend"), false);
  assert.equal(offered.includes("receive_inventory"), false);

  const ceo = experienceFor("ceo", "ceo");
  assert.equal(
    ceo.quickActions.every((action) => action.href !== null || action.actionKey !== null),
    true,
  );
});

test("CEO and Admin see every module, including Admin", () => {
  for (const [roleKey, securityRole] of [
    ["ceo", "ceo"],
    ["admin", "admin"],
  ] as [string, Role][]) {
    const hrefs = hrefsFor(roleKey, securityRole);

    assert.deepEqual(hrefs, [
      "/home",
      "/sales",
      "/projects",
      "/sales/commissions",
      "/requests",
      "/people",
      "/inventory",
      "/operations",
      "/knowledge",
      "/admin",
    ]);
  }
});

test("the Sales Designer experience includes commissions", () => {
  const hrefs = hrefsFor("sales_designer", "employee");

  assert.ok(hrefs.includes("/sales"));
  assert.ok(hrefs.includes("/sales/commissions"));
});

test("the Project Manager experience does not require commissions", () => {
  const experience = experienceFor("project_manager", "supervisor");
  const hrefs = experience.modules.map((module) => module.href);

  assert.equal(hrefs.includes("/sales/commissions"), false);
  assert.equal(hrefs.includes("/sales"), false);
  assert.ok(hrefs.includes("/projects"));
  assert.ok(hrefs.includes("/operations"));
});

test("section grouping follows the product model: operating, support, administration", () => {
  const experience = experienceFor("sales_designer", "employee");
  const sections = new Map<string, string[]>();

  for (const resolved of experience.modules) {
    sections.set(resolved.navSection, [...(sections.get(resolved.navSection) ?? []), resolved.key]);
  }

  assert.deepEqual(sections.get("primary"), [
    "home",
    "sales",
    "projects",
    "commissions",
    "requests",
    "people",
  ]);
  assert.deepEqual(sections.get("support"), ["knowledge"]);
  assert.equal(sections.has("admin"), false);
});

test("an unassigned profile gets the baseline experience, not an empty one", () => {
  const experience = roleExperienceFor({
    roleKey: null,
    resolutionSource: "unassigned",
    capabilities: capabilitiesFor("employee"),
    configuration: registryExperienceConfiguration(),
  });

  assert.deepEqual(
    experience.modules.map((module) => module.key),
    ["home", "requests", "people", "knowledge"],
  );
  assert.equal(experience.roleName, "Unassigned");
  assert.ok(experience.roleDescription?.includes("No business role"));
  assert.equal(experience.landingHref, "/home");
});

test("every security role resolves an experience without throwing", () => {
  for (const role of ["employee", "supervisor", "accounting", "admin", "ceo"] as const) {
    const experience = roleExperienceFor({
      roleKey: normalizeRole(role) === "employee" ? null : null,
      resolutionSource: "unassigned",
      capabilities: capabilitiesFor(role),
      configuration: registryExperienceConfiguration(),
    });

    assert.ok(experience.modules.length > 0, `${role} must resolve at least one module`);
    assert.ok(
      experience.modules.some((module) => module.key === "home"),
      `${role} must be able to land on Home`,
    );
  }
});

test("resolveModules reports hidden, blocked and visible separately", () => {
  const { visible, blocked, hidden } = resolveModules({
    modules: CORE_MODULES,
    roleModules: [
      {
        moduleKey: "home",
        isVisible: true,
        isEmphasized: false,
        isDefaultLanding: true,
        displayOrder: 10,
      },
      {
        moduleKey: "admin",
        isVisible: true,
        isEmphasized: false,
        isDefaultLanding: false,
        displayOrder: 20,
      },
    ],
    capabilities: capabilitiesFor("employee"),
  });

  assert.deepEqual(visible.map((module) => module.key), ["home"]);
  assert.deepEqual(blocked.map((module) => module.key), ["admin"]);
  assert.equal(hidden.length, CORE_MODULES.length - 2);
});
