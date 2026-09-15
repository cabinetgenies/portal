import { ModuleTabs } from "@/components/ui/module-tabs";
import { COMMISSION_ROUTES } from "@/lib/routes";

const TABS = [
  { label: "Overview", href: COMMISSION_ROUTES.overview },
  { label: "Employees", href: COMMISSION_ROUTES.employees },
  { label: "Commission Jobs", href: COMMISSION_ROUTES.jobs },
  { label: "Payments", href: COMMISSION_ROUTES.payments },
  { label: "Plans & Rules", href: COMMISSION_ROUTES.rules },
  { label: "Reports", href: COMMISSION_ROUTES.reports },
];

export function CommissionsNav() {
  return <ModuleTabs label="Commissions sections" tabs={TABS} />;
}
