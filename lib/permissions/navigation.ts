import { CORE_MODULES, NAV_SECTION_LABELS, NAV_SECTION_ORDER } from "@/lib/experience/catalog";
import type { RoleExperience } from "@/lib/experience/types";

/**
 * Navigation is derived from the signed-in person's resolved role experience.
 * Authorization still lives in capabilities + RLS; this file only decides how
 * already-visible modules are presented in the shell.
 */

/**
 * Icon keys the shell can render. Kept as a runtime list as well as a type so a
 * registry row with an unknown icon key degrades to a default icon instead of
 * crashing the navigation.
 */
export const NAV_ICON_KEYS = [
  "dashboard",
  "sales",
  "projects",
  "production",
  "commissions",
  "reports",
  "admin",
  "people",
  "performance",
  "requests",
  "company",
  "inventory",
  "operations",
  "knowledge",
] as const;

export type NavIconKey = (typeof NAV_ICON_KEYS)[number];

export function isNavIconKey(value: unknown): value is NavIconKey {
  return typeof value === "string" && (NAV_ICON_KEYS as readonly string[]).includes(value);
}

export function navIconKey(value: string | null | undefined, fallback: NavIconKey = "dashboard") {
  return isNavIconKey(value) ? value : fallback;
}

export type NavChildItem = {
  label: string;
  href: string;
  icon: NavIconKey;
  description: string;
};

export type NavItem = {
  label: string;
  href: string | null;
  icon: NavIconKey;
  description: string;
  children?: NavChildItem[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

type DomainDefinition = {
  label: string;
  description: string;
  icon: NavIconKey;
  moduleKeys: readonly string[];
  childLabels?: Readonly<Record<string, string>>;
};

const BOS_DOMAINS: readonly DomainDefinition[] = [
  {
    label: "Projects",
    description: "Project lifecycle, sales context and project records.",
    icon: "projects",
    moduleKeys: ["projects", "sales"],
    childLabels: { projects: "Overview", sales: "Sales" },
  },
  {
    label: "Operations",
    description: "Operational workflows, approvals, inventory and delivery support.",
    icon: "operations",
    moduleKeys: ["operations", "requests", "inventory"],
    childLabels: {
      operations: "Overview",
      requests: "Requests & Approvals",
      inventory: "Inventory",
    },
  },
  {
    label: "People",
    description: "People, accountability, performance and leadership cadence.",
    icon: "people",
    moduleKeys: ["people", "performance"],
    childLabels: { people: "Team", performance: "Performance & Leadership" },
  },
  {
    label: "Finance",
    description: "Financial visibility, compensation and reporting.",
    icon: "reports",
    moduleKeys: ["commissions"],
    childLabels: { commissions: "Commissions" },
  },
  {
    label: "Knowledge",
    description: "SOPs, training, policies, playbooks, forms and role expectations.",
    icon: "knowledge",
    moduleKeys: ["knowledge"],
    childLabels: { knowledge: "Knowledge Home" },
  },
] as const;

function domainItem(
  domain: DomainDefinition,
  modules: RoleExperience["modules"],
): NavItem | null {
  const children = domain.moduleKeys
    .map((key) => modules.find((module) => module.key === key))
    .filter((module): module is NonNullable<typeof module> => Boolean(module))
    .map((module) => ({
      label: domain.childLabels?.[module.key] ?? module.name,
      href: module.href,
      icon: module.iconKey,
      description: module.description,
    }));

  if (children.length === 0) return null;

  return {
    label: domain.label,
    href: children[0]?.href ?? null,
    icon: domain.icon,
    description: domain.description,
    children,
  };
}

/**
 * Sidebar information architecture for a resolved role experience.
 *
 * The BOS has a deliberately small set of top-level business domains. Existing
 * role/module visibility still decides which child destinations are present.
 * Ask BOS remains a shell-level action rather than a business domain.
 */
export function navigationForExperience(experience: RoleExperience): NavSection[] {
  const home = experience.modules.find((module) => module.key === "home");
  const admin = experience.modules.find((module) => module.key === "admin");

  const items: NavItem[] = [];

  if (home) {
    items.push({
      label: "Home",
      href: home.href,
      icon: home.iconKey,
      description: home.description,
    });
  }

  for (const domain of BOS_DOMAINS) {
    const item = domainItem(domain, experience.modules);
    if (item) items.push(item);
  }

  if (admin) {
    items.push({
      label: "Administration",
      href: admin.href,
      icon: admin.iconKey,
      description: admin.description,
    });
  }

  return items.length > 0 ? [{ label: "", items }] : [];
}

/**
 * Every active module, grouped by the registry's database section, ignoring role
 * experience. The role editor uses this flat registry view; it is intentionally
 * separate from the user-facing BOS sidebar hierarchy above.
 */
export function registryNavigationSections(): NavSection[] {
  return NAV_SECTION_ORDER.map((section) => ({
    label: NAV_SECTION_LABELS[section],
    items: CORE_MODULES.filter(
      (module) => module.isActive && module.navSection === section,
    ).map((module) => ({
      label: module.name,
      href: module.href,
      icon: module.iconKey,
      description: module.description,
    })),
  })).filter((section) => section.items.length > 0);
}
