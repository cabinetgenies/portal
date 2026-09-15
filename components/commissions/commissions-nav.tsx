import { ModuleTabs } from "@/components/ui/module-tabs";

const TABS = [
  { label: "Dashboard", href: "/commissions" },
  { label: "Jobs", href: "/commissions/jobs" },
  { label: "Employees", href: "/commissions/employees" },
  { label: "Payments", href: "/commissions/payments" },
  { label: "Rules", href: "/commissions/rules" },
  { label: "Reports", href: "/commissions/reports" },
];

export function CommissionsNav() {
  return <ModuleTabs label="Commissions sections" tabs={TABS} />;
}
