import { displayNameFor } from "@/lib/auth/identity";
import { normalizeRole, roleLabel, type Role } from "@/lib/permissions/roles";
import type {
  CompensationPlanRow,
  BusinessRoleRow,
  DepartmentRow,
  EmployeeCompensationAssignmentRow,
  EmployeeCompensationSettingsRow,
  EmployeeDrawPeriodRow,
  ProfileRow,
} from "@/lib/supabase/database.types";

/**
 * The user directory is assembled from tables the portal already has: the
 * profile row itself, compensation eligibility, the effective-dated plan
 * assignment and draw enrollment.
 *
 * The mapping is pure so it can be unit tested without a database — the query
 * module only fetches rows and hands them over.
 */

export type UserDirectoryRow = {
  profileId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  role: Role;
  roleLabel: string;
  /** Security role assignment, plus the business role that shapes the experience. */
  businessRoleId: string | null;
  businessRoleName: string | null;
  businessRoleKey: string | null;
  /** Primary department: the registry assignment, falling back to the legacy text. */
  departmentId: string | null;
  departmentName: string | null;
  department: string | null;
  managerId: string | null;
  managerName: string | null;
  active: boolean;
  statusLabel: string;
  compensationEligible: boolean;
  planName: string | null;
  planParticipantKind: string | null;
  assignmentEffectiveFrom: string | null;
  onDraw: boolean;
  openDrawPeriodFrom: string | null;
  updatedAt: string;
};

export type UserDirectorySources = {
  profiles: readonly ProfileRow[];
  /** Department registry, for resolving `department_id` to a name. */
  departments: readonly Pick<DepartmentRow, "id" | "name" | "slug">[];
  /** Business role registry, for resolving `business_role_id` to a name. */
  businessRoles: readonly Pick<BusinessRoleRow, "id" | "name" | "key">[];
  compensationSettings: readonly EmployeeCompensationSettingsRow[];
  assignments: readonly EmployeeCompensationAssignmentRow[];
  plans: readonly Pick<CompensationPlanRow, "id" | "name" | "participant_kind">[];
  drawPeriods: readonly EmployeeDrawPeriodRow[];
  today: string;
};

export function accountStatusLabel(active: boolean) {
  return active ? "Active" : "Deactivated";
}

export function drawStatusLabel(
  row: Pick<UserDirectoryRow, "onDraw" | "openDrawPeriodFrom">,
) {
  return row.onDraw ? "On draw" : "Standard rate";
}

/** The assignment in force on a date: inclusive start, inclusive open-ended end. */
export function assignmentInForceAt(
  assignments: readonly EmployeeCompensationAssignmentRow[],
  profileId: string,
  onDate: string,
) {
  return assignments.find((assignment) => {
    if (assignment.profile_id !== profileId) return false;
    if (assignment.effective_from > onDate) return false;
    return assignment.effective_to === null || assignment.effective_to >= onDate;
  });
}

export function drawPeriodAt(
  periods: readonly EmployeeDrawPeriodRow[],
  profileId: string,
  onDate: string,
) {
  return periods.find(
    (period) =>
      period.profile_id === profileId &&
      period.effective_from <= onDate &&
      (period.effective_to === null || period.effective_to >= onDate),
  );
}

export function openDrawPeriod(
  periods: readonly EmployeeDrawPeriodRow[],
  profileId: string,
) {
  return periods.find(
    (period) => period.profile_id === profileId && period.effective_to === null,
  );
}

export function buildUserDirectoryRows({
  profiles,
  departments,
  businessRoles,
  compensationSettings,
  assignments,
  plans,
  drawPeriods,
  today,
}: UserDirectorySources): UserDirectoryRow[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const businessRoleById = new Map(businessRoles.map((businessRole) => [businessRole.id, businessRole]));

  const rows = profiles.map<UserDirectoryRow>((profile) => {
    const settings = compensationSettings.find((row) => row.profile_id === profile.id);
    const assignment = assignmentInForceAt(assignments, profile.id, today);
    const plan = assignment ? planById.get(assignment.compensation_plan_id) : undefined;
    const manager = profile.manager_id ? profileById.get(profile.manager_id) : undefined;
    const department = profile.department_id
      ? departmentById.get(profile.department_id)
      : undefined;
    const businessRole = profile.business_role_id
      ? businessRoleById.get(profile.business_role_id)
      : undefined;
    const onDraw = drawPeriodAt(drawPeriods, profile.id, today);
    // The open period is the actionable one: it is what "end draw period" closes.
    const openPeriod = openDrawPeriod(drawPeriods, profile.id);

    return {
      profileId: profile.id,
      name: displayNameFor(profile, profile.email),
      // Kept separately from `name`: editing a user must show the stored values,
      // not the resolved display name, or a save would overwrite real data.
      firstName: profile.first_name,
      lastName: profile.last_name,
      displayName: profile.display_name,
      email: profile.email,
      role: normalizeRole(profile.role),
      roleLabel: roleLabel(profile.role),
      // Both role models are shown side by side on purpose: the security role is
      // what they may do, the business role is what their app looks like.
      businessRoleId: profile.business_role_id,
      businessRoleName: businessRole?.name ?? null,
      businessRoleKey: businessRole?.key ?? null,
      // The registry name wins when a department is assigned; the free-text column
      // is what a profile configured before the registry still carries.
      departmentId: profile.department_id,
      departmentName: department?.name ?? profile.department,
      department: profile.department,
      managerId: profile.manager_id,
      managerName: manager ? displayNameFor(manager, manager.email) : null,
      active: profile.active,
      statusLabel: accountStatusLabel(profile.active),
      compensationEligible: settings?.compensation_eligible ?? false,
      planName: plan?.name ?? null,
      planParticipantKind: plan?.participant_kind ?? null,
      assignmentEffectiveFrom: assignment?.effective_from ?? null,
      onDraw: Boolean(onDraw),
      openDrawPeriodFrom: openPeriod?.effective_from ?? null,
      updatedAt: profile.updated_at,
    };
  });

  // Active accounts first, then alphabetical — the order an administrator wants
  // when looking for someone to configure.
  return rows.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

/** Human labels for the audit actions the user directory is responsible for. */
export const USER_AUDIT_ACTION_LABELS: Record<string, string> = {
  user_created: "User created",
  user_name_changed: "Name changed",
  user_email_changed: "Email changed",
  role_changed: "Role changed",
  department_changed: "Department changed",
  manager_changed: "Manager changed",
  active_status_changed: "Status changed",
  employee_compensation_settings_created: "Compensation eligibility set",
  employee_compensation_settings_updated: "Compensation eligibility changed",
  employee_compensation_assignment_created: "Plan assigned",
  employee_compensation_assignment_updated: "Plan assignment changed",
  employee_draw_period_created: "Placed on draw",
  employee_draw_period_updated: "Draw period changed",
};

export const USER_AUDIT_ENTITY_LABELS: Record<string, string> = {
  profile: "Portal user",
  employee_compensation_settings: "Compensation eligibility",
  employee_compensation_assignment: "Compensation plan assignment",
  employee_draw_period: "Draw enrollment",
};

export function auditActionLabel(action: string) {
  return USER_AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ");
}

export function auditEntityLabel(entityType: string) {
  return USER_AUDIT_ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, " ");
}

/**
 * Audit metadata is either a full `after` snapshot (inserts) or a map of changed
 * columns with `from`/`to` values (updates). Both are reduced to a short,
 * readable line so the panel does not dump raw JSON at the reader.
 */
export function describeAuditEntry(metadata: unknown, maxFields = 3): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const changes: string[] = [];

  for (const [key, value] of Object.entries(record)) {
    if (key === "after") {
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const change = value as Record<string, unknown>;

      if ("from" in change || "to" in change) {
        changes.push(
          `${humanizeField(key)}: ${readableValue(change.from)} → ${readableValue(change.to)}`,
        );
        continue;
      }
    }

    changes.push(`${humanizeField(key)}: ${readableValue(value)}`);
  }

  if (changes.length === 0) {
    return null;
  }

  const shown = changes.slice(0, maxFields);

  return changes.length > shown.length
    ? `${shown.join(" · ")} · +${changes.length - shown.length} more`
    : shown.join(" · ");
}

function humanizeField(field: string) {
  return field.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function readableValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return "…";

  const text = String(value);

  return text.length > 48 ? `${text.slice(0, 45)}…` : text;
}
