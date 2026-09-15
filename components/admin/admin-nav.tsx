import { ModuleTabs } from "@/components/ui/module-tabs";

const TABS = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Compensation plans", href: "/admin/compensation-plans" },
  { label: "Commission settings", href: "/admin/commission-settings" },
];

export function AdminNav() {
  return <ModuleTabs label="Administration sections" tabs={TABS} />;
}
