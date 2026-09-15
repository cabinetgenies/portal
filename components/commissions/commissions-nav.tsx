import { ModuleTabs } from "@/components/ui/module-tabs";
import { COMMISSION_ROUTES } from "@/lib/routes";

const TABS = [
  { label: "Overview", href: COMMISSION_ROUTES.overview },
  { label: "Employees", href: COMMISSION_ROUTES.employees },
  { label: "Payments", href: COMMISSION_ROUTES.payments },
  { label: "Plans & Rules", href: COMMISSION_ROUTES.rules },
  { label: "Reports", href: COMMISSION_ROUTES.reports },
];

/**
 * The commission sub-app's tabs.
 *
 * There is deliberately no "Commission Jobs" tab any more: a project is the
 * shared record and its detail lives at /projects/[id], so the project list is
 * reached from Sales and from the commission dashboards rather than commissions
 * owning a second list of the same records.
 */
export function CommissionsNav() {
  return <ModuleTabs label="Commissions sections" tabs={TABS} />;
}
