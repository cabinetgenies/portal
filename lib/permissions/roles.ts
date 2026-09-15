import { PROFILE_ROLES, type ProfileRole } from "@/lib/supabase/database.types";

export const ROLES = PROFILE_ROLES;

export type Role = ProfileRole;

export const DEFAULT_ROLE: Role = "employee";

export const ROLE_LABELS: Record<Role, string> = {
  employee: "Employee",
  supervisor: "Supervisor",
  accounting: "Accounting",
  admin: "Administrator",
  ceo: "CEO",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  employee: "Own profile and personal workspace.",
  supervisor: "Team visibility for direct reports (expanded in later phases).",
  accounting: "Financial and commission access (expanded in later phases).",
  admin: "User and configuration administration.",
  ceo: "Unrestricted portal-level access.",
};

/**
 * Capabilities are the only thing application code should check. Roles map onto
 * capabilities here, so a later phase can re-map roles without touching UI.
 */
export type Capability =
  | "view:own-profile"
  | "view:team-profiles"
  | "view:all-profiles"
  | "manage:profiles"
  | "view:financials"
  | "administer:portal"
  | "view:jobs-own"
  | "view:jobs-team"
  | "view:jobs-all"
  | "manage:jobs"
  | "edit:job-financials"
  | "create:job-adjustments"
  | "view:commission-config"
  | "manage:commission-config"
  | "manage:employee-commission";

const CAPABILITIES_BY_ROLE: Record<Role, readonly Capability[]> = {
  employee: ["view:own-profile", "view:jobs-own"],
  supervisor: ["view:own-profile", "view:team-profiles", "view:jobs-team"],
  accounting: [
    "view:own-profile",
    "view:financials",
    "view:jobs-all",
    "edit:job-financials",
    "create:job-adjustments",
    "view:commission-config",
  ],
  admin: [
    "view:own-profile",
    "view:team-profiles",
    "view:all-profiles",
    "manage:profiles",
    "view:financials",
    "view:jobs-all",
    "manage:jobs",
    "edit:job-financials",
    "create:job-adjustments",
    "view:commission-config",
    "manage:commission-config",
    "manage:employee-commission",
    "administer:portal",
  ],
  ceo: [
    "view:own-profile",
    "view:team-profiles",
    "view:all-profiles",
    "manage:profiles",
    "view:financials",
    "view:jobs-all",
    "manage:jobs",
    "edit:job-financials",
    "create:job-adjustments",
    "view:commission-config",
    "manage:commission-config",
    "manage:employee-commission",
    "administer:portal",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Falls back to the least-privileged role instead of failing open. */
export function normalizeRole(value: string | null | undefined): Role {
  return isRole(value) ? value : DEFAULT_ROLE;
}

export function roleLabel(value: string | null | undefined): string {
  return ROLE_LABELS[normalizeRole(value)];
}

export function capabilitiesFor(role: Role): readonly Capability[] {
  return CAPABILITIES_BY_ROLE[role];
}

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role].includes(capability);
}

export function isAdministrativeRole(role: Role): boolean {
  return can(role, "administer:portal");
}
