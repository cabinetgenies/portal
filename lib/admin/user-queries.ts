import { cache } from "react";

import {
  auditActionLabel,
  auditEntityLabel,
  buildUserDirectoryRows,
  describeAuditEntry,
  type UserDirectoryRow,
} from "@/lib/admin/user-directory";
import { todayIso } from "@/lib/compensation/queries";
import type {
  AuditEventRow,
  CompensationPlanRow,
  EmployeeCompensationAssignmentRow,
  EmployeeCompensationSettingsRow,
  EmployeeDrawPeriodRow,
  ProfileRow,
} from "@/lib/supabase/database.types";
import { unwrap } from "@/lib/supabase/results";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read layer for the user directory.
 *
 * Everything runs through the request-scoped client, so Row Level Security
 * decides what the signed-in user can see. Administrators already hold
 * `view:all-profiles` and the compensation read policies, so no new read access
 * is introduced here.
 */

export const listUserDirectory = cache(async function listUserDirectory(): Promise<
  UserDirectoryRow[]
> {
  const supabase = await createSupabaseServerClient();

  const [profiles, compensationSettings, assignments, plans, drawPeriods] =
    await Promise.all([
      supabase.from("profiles").select("*").order("first_name", { ascending: true }),
      supabase.from("employee_compensation_settings").select("*"),
      supabase
        .from("employee_compensation_assignments")
        .select("*")
        .order("effective_from", { ascending: false }),
      supabase.from("compensation_plans").select("id, name, participant_kind"),
      supabase
        .from("employee_draw_periods")
        .select("*")
        .order("effective_from", { ascending: false }),
    ]);

  return buildUserDirectoryRows({
    profiles: unwrap<ProfileRow[]>(profiles, "portal users"),
    compensationSettings: unwrap<EmployeeCompensationSettingsRow[]>(
      compensationSettings,
      "compensation eligibility",
    ),
    assignments: unwrap<EmployeeCompensationAssignmentRow[]>(
      assignments,
      "compensation assignments",
    ),
    plans: unwrap<Pick<CompensationPlanRow, "id" | "name" | "participant_kind">[]>(
      plans,
      "compensation plans",
    ),
    drawPeriods: unwrap<EmployeeDrawPeriodRow[]>(drawPeriods, "draw periods"),
    today: todayIso(),
  });
});

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

/** The audit entities a person configuring commission accounts cares about. */
export const USER_AUDIT_ENTITY_TYPES = [
  "profile",
  "employee_compensation_settings",
  "employee_compensation_assignment",
  "employee_draw_period",
] as const;

export type UserAuditEntry = {
  id: string;
  actionLabel: string;
  entityLabel: string;
  subject: string | null;
  actor: string;
  summary: string | null;
  createdAt: string;
};

/** Reads a profile id out of an audit payload when the row itself is not a profile. */
function profileIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const after = record.after;
  const candidates = [
    after && typeof after === "object" && !Array.isArray(after)
      ? (after as Record<string, unknown>).profile_id
      : null,
    record.profile_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return null;
}

export const listRecentUserAuditEvents = cache(
  async function listRecentUserAuditEvents(limit = 12): Promise<UserAuditEntry[]> {
    const supabase = await createSupabaseServerClient();
    const result = await supabase
      .from("audit_events")
      .select("*")
      .in("entity_type", [...USER_AUDIT_ENTITY_TYPES])
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = unwrap<AuditEventRow[]>(result, "user activity");
    const directory = await listUserDirectory();
    const nameById = new Map(directory.map((row) => [row.profileId, row.name]));

    return rows.map((row) => {
      const subjectId =
        row.entity_type === "profile" ? row.entity_id : profileIdFromMetadata(row.metadata);

      return {
        id: row.id,
        actionLabel: auditActionLabel(row.action),
        entityLabel: auditEntityLabel(row.entity_type),
        subject: subjectId ? nameById.get(subjectId) ?? null : null,
        // Auth-service writes (invites) have no portal actor: say so plainly
        // instead of implying a person made the change.
        actor: row.changed_by
          ? nameById.get(row.changed_by) ?? row.changed_by
          : "Supabase Auth",
        summary: describeAuditEntry(row.metadata),
        createdAt: row.created_at,
      };
    });
  },
);
