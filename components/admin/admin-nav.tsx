import { ModuleTabs } from "@/components/ui/module-tabs";

const TABS = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
];

export function AdminNav() {
  return <ModuleTabs label="Administration sections" tabs={TABS} />;
}
