import {
  BASE_EXPERIENCE_MODULE_KEYS,
  BASE_EXPERIENCE_QUICK_ACTION_KEYS,
  BASE_EXPERIENCE_WIDGET_KEYS,
  DEFAULT_ROLE_EXPERIENCES,
} from "@/lib/business/catalog";
import { CORE_MODULES, DASHBOARD_WIDGETS, QUICK_ACTIONS } from "@/lib/experience/catalog";
import type {
  ExperienceConfiguration,
  RoleModuleAssignment,
  RoleQuickActionAssignment,
  RoleWidgetAssignment,
} from "@/lib/experience/types";

/**
 * The configuration as the code registry describes it.
 *
 * This is the fallback for a deployment whose Phase 5 migration has not been
 * applied yet (and for local development without Supabase configured at all): the
 * portal resolves a correct, complete experience from the code registry rather
 * than rendering an empty shell. It is also the oracle the resolver tests use.
 */
export function registryExperienceConfiguration(): ExperienceConfiguration {
  const roleModules: Record<string, readonly RoleModuleAssignment[]> = {};
  const roleWidgets: Record<string, readonly RoleWidgetAssignment[]> = {};
  const roleActions: Record<string, readonly RoleQuickActionAssignment[]> = {};

  for (const [roleKey, experience] of Object.entries(DEFAULT_ROLE_EXPERIENCES)) {
    roleModules[roleKey] = experience.moduleKeys.map((moduleKey, index) => ({
      moduleKey,
      isVisible: true,
      isEmphasized: experience.emphasizedModuleKeys.includes(moduleKey),
      // Home is the landing module for every seeded role.
      isDefaultLanding: moduleKey === "home",
      displayOrder: (index + 1) * 10,
    }));

    roleWidgets[roleKey] = experience.widgets.map((widget, index) => ({
      widgetKey: widget.key,
      isVisible: true,
      span: widget.span,
      displayOrder: (index + 1) * 10,
    }));

    roleActions[roleKey] = experience.quickActionKeys.map((actionKey, index) => ({
      actionKey,
      isVisible: true,
      displayOrder: (index + 1) * 10,
    }));
  }

  return {
    source: "registry",
    modules: CORE_MODULES,
    widgets: DASHBOARD_WIDGETS,
    actions: QUICK_ACTIONS,
    roleModules,
    roleWidgets,
    roleActions,
  };
}

/** The baseline experience an unassigned profile resolves to. */
export function baselineExperience() {
  return {
    moduleKeys: BASE_EXPERIENCE_MODULE_KEYS,
    widgetKeys: BASE_EXPERIENCE_WIDGET_KEYS,
    quickActionKeys: BASE_EXPERIENCE_QUICK_ACTION_KEYS,
  };
}
