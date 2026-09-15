import { ModuleTabs } from "@/components/ui/module-tabs";

const TABS = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Project categories", href: "/admin/project-categories" },
  { label: "Commission plans", href: "/admin/commission-plans" },
];

export function AdminNav() {
  return <ModuleTabs label="Administration sections" tabs={TABS} />;
}
