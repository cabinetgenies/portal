import assert from "node:assert/strict";
import test from "node:test";

import { registryExperienceConfiguration } from "@/lib/experience/config";
import { roleExperienceFor } from "@/lib/experience/resolve";
import { navigationForExperience, registryNavigationSections } from "@/lib/permissions/navigation";
import { capabilitiesFor, type Role } from "@/lib/permissions/roles";
import {
  COMMISSION_ROUTES,
  LEGACY_COMMISSION_REDIRECTS,
  PROJECT_ROUTE_REDIRECTS,
  PROJECT_ROUTES,
  SALES_ROUTES,
  isActivePath,
} from "@/lib/routes";

/**
 * Phase 4.3 pinned the information architecture; Phase 5 makes that architecture
 * configuration-driven. These tests still pin the routes everything links to, the
 * legacy redirects and which nav item shows as active — and now also that the
 * navigation is produced from the role experience rather than a hardcoded list.
 */

function experienceFor(roleKey: string, role: Role) {
  return roleExperienceFor({
    roleKey,
    resolutionSource: "assigned",
    capabilities: capabilitiesFor(role),
    configuration: registryExperienceConfiguration(),
  });
}

test("every remaining commission route lives under /sales/commissions", () => {
  const paths = [
    COMMISSION_ROUTES.overview,
    COMMISSION_ROUTES.employees,
    COMMISSION_ROUTES.employee("profile-1"),
    COMMISSION_ROUTES.payments,
    COMMISSION_ROUTES.rules,
    COMMISSION_ROUTES.reports,
  ];

  assert.deepEqual(paths, [
    "/sales/commissions",
    "/sales/commissions/employees",
    "/sales/commissions/employees/profile-1",
    "/sales/commissions/payments",
    "/sales/commissions/rules",
    "/sales/commissions/reports",
  ]);

  for (const path of paths) {
    assert.ok(path.startsWith("/sales/commissions"), `${path} must sit under Sales`);
  }
});

test("every legacy commission route redirects to its new home", () => {
  const redirects = new Map(
    LEGACY_COMMISSION_REDIRECTS.map((redirect) => [redirect.source, redirect.destination]),
  );

  assert.equal(redirects.get("/commissions"), "/sales/commissions");
  assert.equal(redirects.get("/commissions/employees"), "/sales/commissions/employees");
  assert.equal(
    redirects.get("/commissions/employees/:profileId"),
    "/sales/commissions/employees/:profileId",
  );
  // Jobs are projects now, and the project route is canonical, so even the oldest
  // bookmark lands on /projects rather than on an intermediate.
  assert.equal(redirects.get("/commissions/jobs"), "/projects");
  assert.equal(redirects.get("/commissions/jobs/new"), "/projects/new");
  assert.equal(redirects.get("/commissions/jobs/:projectId"), "/projects/:projectId");
  assert.equal(redirects.get("/commissions/payments"), "/sales/commissions/payments");
  assert.equal(redirects.get("/commissions/rules"), "/sales/commissions/rules");
  assert.equal(redirects.get("/commissions/reports"), "/sales/commissions/reports");
});

test("the canonical project routes are the shared ones", () => {
  assert.equal(PROJECT_ROUTES.overview, "/projects");
  assert.equal(PROJECT_ROUTES.new, "/projects/new");
  assert.equal(PROJECT_ROUTES.project("project-1"), "/projects/project-1");
});

test("old sales and commission project paths redirect to the canonical routes", () => {
  const redirects = new Map(
    PROJECT_ROUTE_REDIRECTS.map((redirect) => [redirect.source, redirect.destination]),
  );

  assert.equal(redirects.get("/sales/projects"), "/projects");
  assert.equal(redirects.get("/sales/projects/:projectId"), "/projects/:projectId");
  assert.equal(redirects.get("/sales/commissions/jobs"), "/projects");
  assert.equal(redirects.get("/sales/commissions/jobs/new"), "/projects/new");
  assert.equal(redirects.get("/sales/commissions/jobs/:projectId"), "/projects/:projectId");

  // Order matters: a static segment must be listed before the dynamic one that
  // would otherwise swallow it.
  const sources = PROJECT_ROUTE_REDIRECTS.map((redirect) => redirect.source);
  assert.ok(
    sources.indexOf("/sales/commissions/jobs/new") <
      sources.indexOf("/sales/commissions/jobs/:projectId"),
    "the new-project redirect must be declared before the project-detail redirect",
  );
});

test("being inside commissions keeps Sales highlighted in the sidebar", () => {
  assert.equal(isActivePath("/sales", SALES_ROUTES.overview), true);
  assert.equal(isActivePath("/sales/commissions", SALES_ROUTES.overview), true);
  assert.equal(
    isActivePath("/sales/commissions/employees/profile-1", SALES_ROUTES.overview),
    true,
  );
  assert.equal(isActivePath("/sales/commissions/payments", SALES_ROUTES.overview), true);

  // …and nothing else lights up.
  assert.equal(isActivePath("/salesx", SALES_ROUTES.overview), false);
  assert.equal(isActivePath("/home", SALES_ROUTES.overview), false);
  assert.equal(isActivePath("/admin/users", SALES_ROUTES.overview), false);
  // Projects is its own module now, so a project no longer highlights Sales.
  assert.equal(isActivePath("/projects", SALES_ROUTES.overview), false);
  assert.equal(isActivePath("/projects/project-1", SALES_ROUTES.overview), false);
});

test("the registry describes every module the navigation can show", () => {
  const sections = registryNavigationSections();
  const items = sections.flatMap((section) => section.items);

  assert.deepEqual(
    items.map((item) => item.href),
    [
      "/home",
      "/sales",
      "/projects",
      "/sales/commissions",
      "/requests",
      "/people",
      "/performance",
      "/inventory",
      "/operations",
      "/knowledge",
      "/admin",
    ],
  );

  // Knowledge is support content and Admin is administration: neither is part of
  // the operating set the product model describes first.
  assert.deepEqual(
    sections.map((section) => section.label),
    ["Operating", "Support", "Administration"],
  );
});

test("navigation for a role comes from that role's experience", () => {
  const salesDesigner = navigationForExperience(experienceFor("sales_designer", "employee"));
  const salesDesignerHrefs = salesDesigner.flatMap((section) =>
    section.items.map((item) => item.href),
  );

  assert.ok(salesDesignerHrefs.includes("/sales/commissions"));
  assert.equal(salesDesignerHrefs.includes("/admin"), false);
  assert.equal(salesDesignerHrefs.includes("/inventory"), false);

  const warehouse = navigationForExperience(experienceFor("warehouse", "employee"));
  const warehouseHrefs = warehouse.flatMap((section) => section.items.map((item) => item.href));

  assert.ok(warehouseHrefs.includes("/inventory"));
  assert.equal(warehouseHrefs.includes("/sales"), false);
  assert.equal(warehouseHrefs.includes("/sales/commissions"), false);

  const admin = navigationForExperience(experienceFor("admin", "admin")).flatMap((section) =>
    section.items.map((item) => item.href),
  );
  assert.ok(admin.includes("/admin"));

  // The experience asks for Admin; the capability decides. A role experience can
  // never hand somebody a module their security role does not hold.
  const employeeOnAdminRole = navigationForExperience(
    experienceFor("admin", "employee"),
  ).flatMap((section) => section.items.map((item) => item.href));

  assert.equal(
    employeeOnAdminRole.includes("/admin"),
    false,
    "experience configuration must never grant the admin module to a role without the capability",
  );
});
