import type { Capability } from "@/lib/permissions/roles";

export type NavIconKey =
  | "dashboard"
  | "sales"
  | "projects"
  | "production"
  | "commissions"
  | "reports"
  | "admin"
  | "people"
  | "requests"
  | "company";

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
    label: "Portal",
    items: [
      {
        label: "Home",
        href: "/home",
        icon: "dashboard",
        description: "Portal overview and personal workspace.",
      },
      {
        label: "People",
        href: "/people",
        icon: "people",
        description: "The team, their roles and their reporting lines.",
      },
      {
        label: "Requests",
        href: "/requests",
        icon: "requests",
        description: "Internal requests and approvals.",
      },
      {
        label: "Company",
        href: "/company",
        icon: "company",
        description: "Company-wide reference data and settings.",
      },
      {
        label: "Sales",
        href: "/sales",
        icon: "sales",
        description: "Sales overview, and the commission sub-app.",
      },
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
