import {
  BASE_EXPERIENCE_MODULE_KEYS,
  BASE_EXPERIENCE_QUICK_ACTION_KEYS,
  BASE_EXPERIENCE_WIDGET_KEYS,
  departmentNameForSlug,
  businessRoleDefinition,
  defaultRoleExperience,
} from "@/lib/business/catalog";
import { NAV_SECTION_LABELS, NAV_SECTION_ORDER } from "@/lib/experience/catalog";
import type {
  AppModuleDefinition,
  DashboardWidgetDefinition,
  ExperienceConfiguration,
  QuickActionDefinition,
  ResolvedModule,
  ResolvedQuickAction,
  ResolvedWidget,
  RoleExperience,
  RoleResolutionSource,
} from "@/lib/experience/types";
import { capabilitySatisfied, moduleCapabilities, quickActionCapabilities } from "@/lib/permissions/module-capabilities";
import type { Capability } from "@/lib/permissions/roles";
import type { NavIconKey } from "@/lib/permissions/navigation";

/**
 * The experience resolver.
 *
 * Pure functions over configuration: no database, no React, no request context.
 * Everything the shell, the home dashboard and the admin preview show comes out
 * of here, so "what would this role see?" has exactly one answer in the codebase
 * and can be unit tested without a live Supabase project.
 */

type ModuleExperienceSources = {
  modules: readonly AppModuleDefinition[];
  roleModules: readonly {
    moduleKey: string;
    isVisible: boolean;
    isEmphasized: boolean;
    isDefaultLanding: boolean;
    displayOrder: number;
  }[];
  capabilities: readonly Capability[];
};

/**
 * Modules the role's configuration shows, in order.
 *
 * A module is included when it exists in the registry, is active, the role's
 * configuration says it is visible, and the person holds a required capability.
 * The three cases are reported separately — `blockedModules` is a configuration
 * that the capabilities veto, `hiddenModules` is a deliberate hiding — so the
 * admin preview can explain the difference instead of just omitting a row.
 */
export function resolveModules({
  modules,
  roleModules,
  capabilities,
}: ModuleExperienceSources) {
  const assignments = new Map(roleModules.map((assignment) => [assignment.moduleKey, assignment]));

  const resolved: ResolvedModule[] = modules
    .filter((module) => module.isActive)
    .map((module) => {
      const assignment = assignments.get(module.key);

      return {
        ...module,
        isVisible: assignment?.isVisible ?? false,
        isEmphasized: assignment?.isEmphasized ?? false,
        isDefaultLanding: assignment?.isDefaultLanding ?? false,
        isAllowed: capabilitySatisfied(moduleCapabilities(module.key), capabilities),
      };
    })
    .sort((a, b) => {
      const orderA = assignments.get(a.key)?.displayOrder ?? a.displayOrder;
      const orderB = assignments.get(b.key)?.displayOrder ?? b.displayOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayOrder - b.displayOrder;
    });

  return {
    visible: resolved.filter((module) => module.isVisible && module.isAllowed),
    blocked: resolved.filter((module) => module.isVisible && !module.isAllowed),
    hidden: resolved.filter((module) => !module.isVisible),
  };
}

export function resolveWidgets({
  widgets,
  roleWidgets,
}: {
  widgets: readonly DashboardWidgetDefinition[];
  roleWidgets: readonly {
    widgetKey: string;
    isVisible: boolean;
    span: number;
    displayOrder: number;
  }[];
}) {
  const assignments = new Map(roleWidgets.map((assignment) => [assignment.widgetKey, assignment]));

  return widgets
    .filter((widget) => widget.isActive && assignments.get(widget.key)?.isVisible)
    .map<ResolvedWidget>((widget) => {
      const assignment = assignments.get(widget.key);

      return {
        ...widget,
        isVisible: true,
        span: assignment?.span ?? 1,
      };
    })
    .sort((a, b) => {
      const orderA = assignments.get(a.key)?.displayOrder ?? a.displayOrder;
      const orderB = assignments.get(b.key)?.displayOrder ?? b.displayOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayOrder - b.displayOrder;
    });
}

export function resolveQuickActions({
  actions,
  roleActions,
  capabilities,
}: {
  actions: readonly QuickActionDefinition[];
  roleActions: readonly {
    actionKey: string;
    isVisible: boolean;
    displayOrder: number;
  }[];
  capabilities: readonly Capability[];
}) {
  const assignments = new Map(roleActions.map((assignment) => [assignment.actionKey, assignment]));

  return actions
    .filter((action) => {
      const assignment = assignments.get(action.key);

      // An action that is not active, not assigned or not permitted never
      // renders: an action is a promise that something will happen.
      return (
        action.isActive &&
        assignment?.isVisible === true &&
        capabilitySatisfied(quickActionCapabilities(action.key), capabilities)
      );
    })
    .map<ResolvedQuickAction>((action) => ({ ...action, isVisible: true }))
    .sort((a, b) => {
      const orderA = assignments.get(a.key)?.displayOrder ?? a.displayOrder;
      const orderB = assignments.get(b.key)?.displayOrder ?? b.displayOrder;
      if (orderA !== orderB) return orderA - orderB;
      return a.displayOrder - b.displayOrder;
    });
}

/**
 * The landing module for an experience.
 *
 * Falls back to Home and then to the first visible module, so a role can never be
 * pointed at a module it cannot reach.
 */
export function landingHrefFor(modules: readonly ResolvedModule[], fallbackHref = "/home") {
  const explicit = modules.find((module) => module.isDefaultLanding);
  if (explicit) return explicit.href;

  const home = modules.find((module) => module.key === "home");
  if (home) return home.href;

  return modules[0]?.href ?? fallbackHref;
}

export type ResolveRoleExperienceInput = {
  roleKey: string | null;
  resolutionSource: RoleResolutionSource;
  departmentSlug?: string | null;
  capabilities: readonly Capability[];
  configuration: ExperienceConfiguration;
};

/**
 * The whole experience for one role.
 *
 * When the role has no configuration the catalog defaults are used; when the role
 * key is unknown entirely, the baseline experience is used. Either way the result
 * is shaped like a configured one, so the shell has no special cases.
 */
export function roleExperienceFor({
  roleKey,
  resolutionSource,
  departmentSlug,
  capabilities,
  configuration,
}: ResolveRoleExperienceInput): RoleExperience {
  const definition = businessRoleDefinition(roleKey);
  const defaults = defaultRoleExperience(roleKey);

  const moduleAssignments =
    configuration.roleModules[roleKey ?? ""] ??
    assignmentFromDefaults(
      defaults?.moduleKeys ?? BASE_EXPERIENCE_MODULE_KEYS,
      defaults?.emphasizedModuleKeys ?? [],
      configuration.modules,
    );

  const widgetAssignments =
    configuration.roleWidgets[roleKey ?? ""] ??
    (defaults?.widgets ?? BASE_EXPERIENCE_WIDGET_KEYS.map((key) => ({ key, span: 1 }))).map(
      (widget, index) => ({
        widgetKey: widget.key,
        isVisible: true,
        span: widget.span,
        displayOrder: (index + 1) * 10,
      }),
    );

  const actionAssignments =
    configuration.roleActions[roleKey ?? ""] ??
    (defaults?.quickActionKeys ?? BASE_EXPERIENCE_QUICK_ACTION_KEYS).map((key, index) => ({
      actionKey: key,
      isVisible: true,
      displayOrder: (index + 1) * 10,
    }));

  const { visible, blocked, hidden } = resolveModules({
    modules: configuration.modules,
    roleModules: moduleAssignments,
    capabilities,
  });

  const widgets = resolveWidgets({
    widgets: configuration.widgets,
    roleWidgets: widgetAssignments,
  });

  const quickActions = resolveQuickActions({
    actions: configuration.actions,
    roleActions: actionAssignments,
    capabilities,
  });

  const resolvedDepartmentSlug = departmentSlug ?? definition?.departmentSlug ?? null;

  return {
    roleKey,
    roleName: definition?.name ?? (roleKey ? titleCaseKey(roleKey) : "Unassigned"),
    roleDescription:
      definition?.description ??
      (roleKey
        ? null
        : "No business role is assigned to this profile yet, so the baseline experience is shown. Assign a business role under Admin → Users."),
    departmentSlug: resolvedDepartmentSlug,
    departmentName: departmentNameForSlug(resolvedDepartmentSlug),
    resolutionSource,
    modules: visible,
    blockedModules: blocked,
    hiddenModules: hidden,
    landingHref: landingHrefFor(visible),
    widgets,
    quickActions,
    knowledgeScope: { roleKey, departmentSlug: resolvedDepartmentSlug },
  };
}

function assignmentFromDefaults(
  moduleKeys: readonly string[],
  emphasizedKeys: readonly string[],
  modules: readonly AppModuleDefinition[],
) {
  const moduleByKey = new Map(modules.map((module) => [module.key, module]));

  return moduleKeys
    .filter((key) => moduleByKey.has(key))
    .map((key, index) => ({
      moduleKey: key,
      isVisible: true,
      isEmphasized: emphasizedKeys.includes(key),
      isDefaultLanding: index === 0,
      displayOrder: (index + 1) * 10,
    }));
}

function titleCaseKey(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Group visible modules into the navigation sections the shell renders. */
export function navigationSectionsFromModules(
  modules: readonly ResolvedModule[],
  sectionOrder: readonly ("primary" | "support" | "admin")[] = NAV_SECTION_ORDER,
  sectionLabels: Record<"primary" | "support" | "admin", string> = NAV_SECTION_LABELS,
) {
  return sectionOrder
    .map((section) => ({
      label: sectionLabels[section],
      items: modules
        .filter((module) => module.navSection === section)
        .map((module) => ({
          label: module.name,
          href: module.href,
          icon: module.iconKey as NavIconKey,
          description: module.description,
        })),
    }))
    .filter((section) => section.items.length > 0);
}
