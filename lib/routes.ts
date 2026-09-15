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

export const COMMISSION_ROUTES = {
  overview: "/sales/commissions",
  employees: "/sales/commissions/employees",
  employee: (profileId: string) => `/sales/commissions/employees/${profileId}`,
  jobs: "/sales/commissions/jobs",
  newJob: "/sales/commissions/jobs/new",
  job: (jobId: string) => `/sales/commissions/jobs/${jobId}`,
  payments: "/sales/commissions/payments",
  rules: "/sales/commissions/rules",
  reports: "/sales/commissions/reports",
} as const;

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
  { source: "/commissions/jobs", destination: COMMISSION_ROUTES.jobs },
  { source: "/commissions/jobs/new", destination: COMMISSION_ROUTES.newJob },
  { source: "/commissions/jobs/:jobId", destination: `${COMMISSION_ROUTES.jobs}/:jobId` },
  { source: "/commissions/payments", destination: COMMISSION_ROUTES.payments },
  { source: "/commissions/rules", destination: COMMISSION_ROUTES.rules },
  { source: "/commissions/reports", destination: COMMISSION_ROUTES.reports },
] as const;

/**
 * Where the Phase 5 "preferred" project paths resolve.
 *
 * The phase document names /sales/projects and /sales/projects/[id]. The portal
 * already has canonical routes for both projects and jobs, so rather than standing
 * up a second project list that would drift from the first, the preferred paths
 * redirect to them: `/projects` is the module's own route, and a project's detail
 * is the job record under commissions, where its commission context lives.
 */
export const SALES_PROJECT_REDIRECTS = [
  { source: "/sales/projects", destination: "/projects" },
  { source: "/sales/projects/:jobId", destination: "/sales/commissions/jobs/:jobId" },
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
