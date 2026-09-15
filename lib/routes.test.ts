import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMISSION_ROUTES,
  LEGACY_COMMISSION_REDIRECTS,
  SALES_ROUTES,
  isActivePath,
} from "@/lib/routes";
import { PORTAL_NAVIGATION, navigationForCapabilities } from "@/lib/permissions/navigation";
import { capabilitiesFor } from "@/lib/permissions/roles";

/**
 * Phase 4.3: commissions moved under Sales.
 *
 * These tests pin the information architecture: the top-level navigation, the route
 * paths everything links to, the legacy redirects, and which nav item shows as active.
 */

test("the portal navigation is the six top-level areas", () => {
  const items = PORTAL_NAVIGATION.flatMap((section) => section.items);

  assert.deepEqual(
    items.map((item) => item.label),
    ["Home", "People", "Requests", "Company", "Sales", "Admin"],
  );
  assert.equal(
    items.some((item) => item.label === "Commissions"),
    false,
    "Commissions must not be a top-level item",
  );
});

test("Sales is a top-level area and nothing else claims the commission module", () => {
  const sales = PORTAL_NAVIGATION.flatMap((section) => section.items).filter(
    (item) => item.href === SALES_ROUTES.overview,
  );

  assert.equal(sales.length, 1);
  assert.equal(
    PORTAL_NAVIGATION.flatMap((section) => section.items).filter((item) =>
      item.href.includes("commissions"),
    ).length,
    0,
    "there is no separate top-level commissions entry",
  );
});

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

  // `/commissions/jobs/new` must not be swallowed by the dynamic job route.
  assert.equal(redirects.get("/commissions/jobs/new"), "/sales/commissions/jobs/new");
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

test("the Sales item is visible to every signed-in role", () => {
  for (const role of ["employee", "supervisor", "accounting", "admin", "ceo"] as const) {
    const items = navigationForCapabilities(capabilitiesFor(role)).flatMap(
      (section) => section.items,
    );

    assert.ok(
      items.some((item) => item.href === SALES_ROUTES.overview),
      `${role} must see Sales`,
    );
    assert.equal(
      items.some((item) => item.href === "/admin"),
      role === "admin" || role === "ceo",
      "Admin stays capability-gated",
    );
  }
});
