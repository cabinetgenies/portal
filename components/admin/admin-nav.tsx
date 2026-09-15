import { ModuleTabs } from "@/components/ui/module-tabs";

const TABS = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Departments", href: "/admin/departments" },
  { label: "Roles", href: "/admin/roles" },
  { label: "Role experiences", href: "/admin/role-experiences" },
  { label: "Compensation plans", href: "/admin/compensation-plans" },
  { label: "Commission settings", href: "/admin/commission-settings" },
  { label: "Settings", href: "/admin/settings" },
];

export function AdminNav() {
  return <ModuleTabs label="Administration sections" tabs={TABS} />;
}
