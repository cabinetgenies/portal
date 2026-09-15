import { CORE_MODULES, NAV_SECTION_LABELS, NAV_SECTION_ORDER } from "@/lib/experience/catalog";
import type { RoleExperience } from "@/lib/experience/types";

/**
 * Navigation, derived from the module registry and the signed-in person's role
 * experience.
 *
 * This module deliberately holds no list of modules any more. Navigation is
 * configuration (public.app_modules + public.role_modules, mirrored in
 * lib/experience/catalog.ts) and the shell renders whatever the resolver returns,
 * so adding a module or changing which role sees it never means editing a
 * component.
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

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconKey;
  description: string;
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/** The navigation sections for a resolved role experience. */
export function navigationForExperience(experience: RoleExperience): NavSection[] {
  return NAV_SECTION_ORDER.map((section) => ({
    label: NAV_SECTION_LABELS[section],
    items: experience.modules
      .filter((module) => module.navSection === section)
      .map((module) => ({
        label: module.name,
        href: module.href,
        icon: module.iconKey,
        description: module.description,
      })),
  })).filter((section) => section.items.length > 0);
}

/**
 * Every active module, grouped by section, ignoring role experience.
 *
 * Used by the role editor to show the full registry it is choosing from, and by
 * the company-wide role defaults — never as the navigation for a signed-in
 * person, which always comes from their resolved experience.
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
