import type { Capability } from "@/lib/permissions/roles";

export type NavIconKey =
  | "dashboard"
  | "sales"
  | "projects"
  | "production"
  | "commissions"
  | "reports"
  | "admin";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconKey;
  description: string;
  requiredCapability?: Capability;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/**
 * Portal navigation is configuration, not markup. The same structure drives the
 * desktop sidebar, the mobile drawer and the "Your Workspace" cards, so a new
 * module is added in one place.
 */
export const PORTAL_NAVIGATION: NavSection[] = [
  {
    label: "Home",
    items: [
      {
        label: "Dashboard",
        href: "/home",
        icon: "dashboard",
        description: "Portal overview and personal workspace.",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Sales",
        href: "/sales",
        icon: "sales",
        description: "Pipeline, estimates and closed business.",
      },
      {
        label: "Projects",
        href: "/projects",
        icon: "projects",
        description: "Active jobs, milestones and schedules.",
      },
      {
        label: "Production",
        href: "/production",
        icon: "production",
        description: "Shop floor workload and job status.",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Commissions",
        href: "/commissions",
        icon: "commissions",
        description: "Jobs, employees, payments and rules.",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: "reports",
        description: "Company reporting and exports.",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "Admin",
        href: "/admin",
        icon: "admin",
        description: "Users, roles and portal configuration.",
        requiredCapability: "administer:portal",
      },
    ],
  },
];

export function navigationForCapabilities(capabilities: readonly Capability[]) {
  return PORTAL_NAVIGATION.map((section) => ({
    label: section.label,
    items: section.items.filter(
      (item) => !item.requiredCapability || capabilities.includes(item.requiredCapability),
    ),
  })).filter((section) => section.items.length > 0);
}

export function workspaceModules() {
  return PORTAL_NAVIGATION.filter((section) => section.label !== "Home").flatMap(
    (section) => section.items,
  );
}
