import type { Capability } from "@/lib/permissions/roles";

/**
 * The three configurable slices of a role experience, and the one capability that
 * governs editing them.
 *
 * This lives outside the "use server" action module because a Server Action module
 * may only export async functions, and both the actions and the editor component
 * need these names.
 */

export const EXPERIENCE_KINDS = ["module", "widget", "action"] as const;

export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];

export const EXPERIENCE_KIND_LABELS: Record<ExperienceKind, string> = {
  module: "Module",
  widget: "Dashboard widget",
  action: "Quick action",
};

export function isExperienceKind(value: unknown): value is ExperienceKind {
  return typeof value === "string" && (EXPERIENCE_KINDS as readonly string[]).includes(value);
}

/** Editing role configuration requires the same capability as administration. */
export const CONFIGURATION_CAPABILITY: Capability = "administer:portal";
