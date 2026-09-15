import assert from "node:assert/strict";
import test from "node:test";

import { registryExperienceConfiguration } from "@/lib/experience/config";
import { roleExperienceFor } from "@/lib/experience/resolve";
import { navigationForExperience, registryNavigationSections } from "@/lib/permissions/navigation";
import { capabilitiesFor, type Role } from "@/lib/permissions/roles";
import {
  COMMISSION_ROUTES,
  LEGACY_COMMISSION_REDIRECTS,
  SALES_PROJECT_REDIRECTS,
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

test("every commission route lives under /sales/commissions", () => {
  const paths = [
    COMMISSION_ROUTES.overview,
    COMMISSION_ROUTES.employees,
    COMMISSION_ROUTES.employee("profile-1"),
    COMMISSION_ROUTES.jobs,
    COMMISSION_ROUTES.newJob,
    COMMISSION_ROUTES.job("job-1"),
    COMMISSION_ROUTES.payments,
    COMMISSION_ROUTES.rules,
    COMMISSION_ROUTES.reports,
  ];

  assert.deepEqual(paths, [
    "/sales/commissions",
    "/sales/commissions/employees",
    "/sales/commissions/employees/profile-1",
    "/sales/commissions/jobs",
    "/sales/commissions/jobs/new",
    "/sales/commissions/jobs/job-1",
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
  assert.equal(redirects.get("/commissions/jobs"), "/sales/commissions/jobs");
  assert.equal(redirects.get("/commissions/jobs/new"), "/sales/commissions/jobs/new");
  assert.equal(redirects.get("/commissions/jobs/:jobId"), "/sales/commissions/jobs/:jobId");
  assert.equal(redirects.get("/commissions/payments"), "/sales/commissions/payments");
  assert.equal(redirects.get("/commissions/rules"), "/sales/commissions/rules");
  assert.equal(redirects.get("/commissions/reports"), "/sales/commissions/reports");
});

test("the preferred /sales/projects paths resolve to the canonical existing routes", () => {
  // Phase 5 names /sales/projects and /sales/projects/[id] as preferred paths. The
  // portal already has canonical project and job routes, so the preferred paths
  // redirect rather than duplicating a second project list.
  const redirects = new Map(
    SALES_PROJECT_REDIRECTS.map((redirect) => [redirect.source, redirect.destination]),
  );

  assert.equal(redirects.get("/sales/projects"), "/projects");
  assert.equal(redirects.get("/sales/projects/:jobId"), "/sales/commissions/jobs/:jobId");
});

test("being inside commissions keeps Sales highlighted in the sidebar", () => {
  assert.equal(isActivePath("/sales", SALES_ROUTES.overview), true);
  assert.equal(isActivePath("/sales/commissions", SALES_ROUTES.overview), true);
  assert.equal(
    isActivePath("/sales/commissions/employees/profile-1", SALES_ROUTES.overview),
    true,
  );
  assert.equal(isActivePath("/sales/commissions/jobs", SALES_ROUTES.overview), true);

  // …and nothing else lights up.
  assert.equal(isActivePath("/salesx", SALES_ROUTES.overview), false);
  assert.equal(isActivePath("/home", SALES_ROUTES.overview), false);
  assert.equal(isActivePath("/admin/users", SALES_ROUTES.overview), false);
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
