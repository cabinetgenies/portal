/**
 * Route definitions for the portal, in one place.
 *
 * Single source of truth for two things that would otherwise drift: the paths the
 * application links to, and the legacy paths that must keep working. `next.config.ts`
 * imports the redirect list, so a moved route and its redirect cannot disagree.
 */

export const SALES_ROUTES = {
  overview: "/sales",
  commissions: "/sales/commissions",
} as const;

/**
 * Canonical project routes.
 *
 * A project is the shared parent entity. Project-level sections live under the
 * project record so opening a project is the one entry point for its sales,
 * commission and audit context.
 */
export const PROJECT_ROUTES = {
  overview: "/projects",
  new: "/projects/new",
  project: (projectId: string) => `/projects/${projectId}`,
  sales: (projectId: string) => `/projects/${projectId}/sales`,
  commission: (projectId: string) => `/projects/${projectId}/commission`,
  history: (projectId: string) => `/projects/${projectId}/history`,
} as const;

export const COMMISSION_ROUTES = {
  overview: "/sales/commissions",
  employees: "/sales/commissions/employees",
  employee: (profileId: string) => `/sales/commissions/employees/${profileId}`,
  payments: "/sales/commissions/payments",
  rules: "/sales/commissions/rules",
  reports: "/sales/commissions/reports",
} as const;

/**
 * Where project routes used to live.
 *
 * Commissions must not own the canonical project detail route, so the job paths
 * redirect to the project paths rather than being kept as a second
 * implementation. Redirects run before routing, so these win over any page that
 * might still exist at the old path.
 */
export const PROJECT_ROUTE_REDIRECTS = [
  { source: "/sales/projects", destination: PROJECT_ROUTES.overview },
  {
    source: "/sales/projects/:projectId",
    destination: `${PROJECT_ROUTES.overview}/:projectId`,
  },
  // `/jobs/new` must be listed before the dynamic job route, or it is swallowed.
  { source: "/sales/commissions/jobs", destination: PROJECT_ROUTES.overview },
  { source: "/sales/commissions/jobs/new", destination: PROJECT_ROUTES.new },
  {
    source: "/sales/commissions/jobs/:projectId",
    destination: `${PROJECT_ROUTES.overview}/:projectId`,
  },
] as const;

/**
 * Where the commission routes lived before they moved under Sales.
 *
 * They redirect permanently rather than 404: bookmarks, the browser history of
 * anyone mid-task, and anything already pasted into a ticket keep working.
 */
export const LEGACY_COMMISSION_REDIRECTS = [
  { source: "/commissions", destination: COMMISSION_ROUTES.overview },
  { source: "/commissions/employees", destination: COMMISSION_ROUTES.employees },
  { source: "/commissions/employees/:profileId", destination: `${COMMISSION_ROUTES.employees}/:profileId` },
  { source: "/commissions/jobs", destination: PROJECT_ROUTES.overview },
  { source: "/commissions/jobs/new", destination: PROJECT_ROUTES.new },
  { source: "/commissions/jobs/:projectId", destination: `${PROJECT_ROUTES.overview}/:projectId` },
  { source: "/commissions/payments", destination: COMMISSION_ROUTES.payments },
  { source: "/commissions/rules", destination: COMMISSION_ROUTES.rules },
  { source: "/commissions/reports", destination: COMMISSION_ROUTES.reports },
] as const;

/**
 * True when a navigation item should show as the current section.
 *
 * A deeper path keeps its parent highlighted — `/sales/commissions/jobs` marks
 * "Sales" active — which is what makes the hierarchy legible in the sidebar.
 */
export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
