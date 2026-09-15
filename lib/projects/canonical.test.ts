import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PROJECT_ROUTES, PROJECT_ROUTE_REDIRECTS } from "@/lib/routes";

/**
 * Canonical project structure.
 *
 * A project is the shared parent entity, so these tests pin the things that would
 * quietly rot: that the canonical routes exist, that the old commission job routes
 * are redirects rather than a second implementation, that the detail page reuses
 * the existing financial/commission/audit components instead of reimplementing
 * them, and that links point at /projects rather than back at commissions.
 */

const ROOT = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function routeFiles() {
  const appDirectory = path.join(ROOT, "app");
  const found: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      found.push(path.relative(ROOT, fullPath).replaceAll("\\", "/"));
    }
  };

  walk(appDirectory);
  return found;
}

test("the canonical project routes exist", () => {
  const files = routeFiles();

  assert.ok(files.includes("app/(app)/projects/page.tsx"), "/projects must exist");
  assert.ok(files.includes("app/(app)/projects/new/page.tsx"), "/projects/new must exist");
  assert.ok(files.includes("app/(app)/projects/[id]/page.tsx"), "/projects/[id] must exist");

  assert.equal(PROJECT_ROUTES.overview, "/projects");
  assert.equal(PROJECT_ROUTES.new, "/projects/new");
  assert.equal(PROJECT_ROUTES.project("abc"), "/projects/abc");
});

test("the old commission job routes are gone, replaced by redirects", () => {
  const files = routeFiles();

  for (const stale of [
    "app/(app)/sales/commissions/jobs/page.tsx",
    "app/(app)/sales/commissions/jobs/new/page.tsx",
    "app/(app)/sales/commissions/jobs/[id]/page.tsx",
    "app/(app)/sales/projects/page.tsx",
    "app/(app)/sales/projects/[id]/page.tsx",
  ]) {
    assert.equal(existsSync(path.join(ROOT, stale)), false, `${stale} must not exist`);
    assert.equal(files.includes(stale), false, `${stale} must not be routable`);
  }

  const redirects = new Map(
    PROJECT_ROUTE_REDIRECTS.map((redirect) => [redirect.source, redirect.destination]),
  );

  assert.equal(redirects.get("/sales/commissions/jobs"), "/projects");
  assert.equal(redirects.get("/sales/commissions/jobs/new"), "/projects/new");
  assert.equal(redirects.get("/sales/commissions/jobs/:projectId"), "/projects/:projectId");
  assert.equal(redirects.get("/sales/projects"), "/projects");
  assert.equal(redirects.get("/sales/projects/:projectId"), "/projects/:projectId");

  // next.config.ts must actually serve them.
  const nextConfig = read("next.config.ts");
  assert.ok(
    nextConfig.includes("PROJECT_ROUTE_REDIRECTS"),
    "next.config.ts must register the project redirects",
  );
});

test("the canonical detail page reuses the existing financial, commission and audit components", () => {
  const page = read("app/(app)/projects/[id]/page.tsx");

  // Sections the phase document asks for.
  for (const section of ["Overview", "Sales financials", "Commission", "Final audit"]) {
    assert.ok(page.includes(section), `the project detail page must have a ${section} section`);
  }

  // Reuse, not reimplementation: the same components the commission route used.
  for (const component of [
    "@/components/commission/job-commission-panel",
    "@/components/commission/final-audit-panel",
    "@/components/commission/job-financials-form",
    "@/components/commission/job-forms",
  ]) {
    assert.ok(page.includes(component), `the project detail page must reuse ${component}`);
  }

  // And the audit workflow is not duplicated: it renders the existing panel and
  // reads the existing audit queries.
  assert.ok(page.includes("@/lib/commission/audit-queries"));
  assert.ok(page.includes("deriveFinalAuditState"));
});

test("the project list reads stored figures and the commission view model, never its own math", () => {
  const queries = read("lib/projects/queries.ts");

  // Stored job figures.
  for (const column of ["actual_total_revenue", "actual_total_cost", "job_gross_profit", "job_gp_percent"]) {
    assert.ok(queries.includes(column), `the project list must read ${column}`);
  }

  // The commission engine's own view model.
  assert.ok(queries.includes("projectedCommissionForJob"));
  assert.ok(queries.includes("loadCommissionWorkspace"));
  assert.ok(queries.includes("deriveFinalAuditState"));

  // No independent recalculation: the engine and the financial calculation are
  // not re-implemented in the project layer.
  for (const forbidden of [
    "calculateCommissionEvent",
    "calculateStandardCommissionRate",
    "computeJobFinancials",
    "calculateNetCommissionPayable",
  ]) {
    assert.equal(
      queries.includes(forbidden),
      false,
      `lib/projects/queries.ts must not recalculate commission (${forbidden})`,
    );
  }

  const page = read("app/(app)/projects/page.tsx");
  assert.ok(page.includes("projectedCommission"), "the list must show the projected commission");
  assert.ok(page.includes("auditStateLabel"), "the list must show the final audit state");
});

test("sales and commissions link to the canonical project routes", () => {
  const salesPage = read("app/(app)/sales/page.tsx");
  const salesNav = read("components/sales/sales-nav.tsx");
  const commissionsNav = read("components/commissions/commissions-nav.tsx");
  const commissionDashboard = read("app/(app)/sales/commissions/page.tsx");
  const designerDashboard = read("app/(app)/sales/commissions/employees/[id]/page.tsx");
  const payments = read("app/(app)/sales/commissions/payments/page.tsx");

  assert.ok(salesPage.includes("PROJECT_ROUTES.overview"), "Sales must link to /projects");
  assert.ok(salesNav.includes("PROJECT_ROUTES.overview"), "the Sales tab bar must link to Projects");

  // The commission sub-app no longer advertises a jobs list of its own.
  assert.equal(
    commissionsNav.includes("COMMISSION_ROUTES.jobs"),
    false,
    "commissions must not keep a jobs tab",
  );

  for (const [name, source] of [
    ["the commission dashboard", commissionDashboard],
    ["the designer commission dashboard", designerDashboard],
    ["the payments queue", payments],
  ] as const) {
    assert.equal(
      source.includes("/sales/commissions/jobs/"),
      false,
      `${name} must not link at the old job route`,
    );
    assert.ok(
      source.includes("/projects/") || source.includes("PROJECT_ROUTES.project("),
      `${name} must link to the canonical project detail`,
    );
  }

  // The code registry and the SQL seed describe the same catalog. If one keeps a
  // stale path, re-seeding a deployment quietly points it back at a redirect —
  // which is exactly what happened before this guard existed.
  for (const [name, source] of [
    ["the seed migration", read("supabase/migrations/20260915230200_seed_business_architecture.sql")],
    ["the code registry", read("lib/experience/catalog.ts")],
  ] as const) {
    assert.equal(
      source.includes("/sales/commissions/jobs"),
      false,
      `${name} must not point at the old commission job routes`,
    );
  }

  // No component or page may still link at the old job paths.
  const offenders: string[] = [];

  for (const file of routeFiles()) {
    if (!file.endsWith(".tsx")) continue;
    if (read(file).includes("/sales/commissions/jobs/")) {
      offenders.push(file);
    }
  }

  for (const file of readComponents()) {
    if (read(file).includes("/sales/commissions/jobs/")) {
      offenders.push(file);
    }
  }

  assert.deepEqual(offenders, [], "nothing may link at the old commission job routes");
});

function readComponents() {
  const componentsDirectory = path.join(ROOT, "components");
  const found: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name.endsWith(".tsx")) {
        found.push(path.relative(ROOT, fullPath).replaceAll("\\", "/"));
      }
    }
  };

  walk(componentsDirectory);
  return found;
}
