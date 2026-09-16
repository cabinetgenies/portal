import { cache } from "react";

import { isSupabaseConfigured } from "@/lib/env";
import {
  type ActionItemRow,
  type DecisionRow,
  type IssueNoteRow,
  type IssueRow,
  type MeetingAgendaSectionRow,
  type MeetingHeadlineRow,
  type MeetingParticipantRow,
  type MeetingRow,
  type MeetingTemplateRow,
  type PerformanceMeasurableRow,
  type PerformanceReviewManagerNoteRow,
  type PerformanceReviewRow,
  type PerformanceScorecardEntryRow,
  type QuarterlyPriorityRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Read layer for Performance & Leadership.
 *
 * Every read goes through the request-scoped Supabase client, so Row Level
 * Security is the authority on what the signed-in person can see. When the
 * database is not configured or a table is missing, the functions return empty
 * arrays rather than throwing: the module should still render clean empty states
 * instead of taking the portal down.
 */

async function readTable<T>(
  table: string,
  context: string,
  order?: { column: string; ascending: boolean },
): Promise<T[]> {
  if (!isSupabaseConfigured) return [];

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from(table as never).select("*");
    if (order) query = query.order(order.column, { ascending: order.ascending });
    const { data, error } = await query;

    if (error) {
      console.error(`Could not load ${context}:`, error.message);
      return [];
    }

    return (data ?? []) as T[];
  } catch (error) {
    console.error(`Could not load ${context}:`, error);
    return [];
  }
}

type NameableProfile = {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
};

function formatProfileName(profile: NameableProfile) {
  const fullName = [profile.first_name, profile.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  if (fullName) return fullName;
  if (profile.display_name?.trim()) return profile.display_name.trim();
  if (profile.email?.trim()) return profile.email.trim().split("@")[0];
  return "Portal user";
}

export const listMeasurables = cache(async () =>
  readTable<PerformanceMeasurableRow>("performance_measurables", "scorecard measurables", {
    column: "name",
    ascending: true,
  }),
);

export const listScorecardEntries = cache(async () =>
  readTable<PerformanceScorecardEntryRow>(
    "performance_scorecard_entries",
    "scorecard entries",
    { column: "period_start", ascending: false },
  ),
);

export const listPriorities = cache(async () =>
  readTable<QuarterlyPriorityRow>("quarterly_priorities", "quarterly priorities", {
    column: "year",
    ascending: false,
  }),
);

export const listMeetingTemplates = cache(async () =>
  readTable<MeetingTemplateRow>("meeting_templates", "meeting templates", {
    column: "name",
    ascending: true,
  }),
);

export const listMeetingAgendaSections = cache(async () =>
  readTable<MeetingAgendaSectionRow>(
    "meeting_agenda_sections",
    "meeting agenda sections",
    { column: "display_order", ascending: true },
  ),
);

export const listMeetings = cache(async () =>
  readTable<MeetingRow>("meetings", "meetings", {
    column: "meeting_date",
    ascending: false,
  }),
);

export const listMeetingParticipants = cache(async () =>
  readTable<MeetingParticipantRow>("meeting_participants", "meeting participants", {
    column: "created_at",
    ascending: true,
  }),
);

export const listMeetingHeadlines = cache(async () =>
  readTable<MeetingHeadlineRow>("meeting_headlines", "meeting headlines", {
    column: "created_at",
    ascending: false,
  }),
);

export const listIssues = cache(async () =>
  readTable<IssueRow>("issues", "issues", { column: "created_at", ascending: false }),
);

export const listIssueNotes = cache(async () =>
  readTable<IssueNoteRow>("issue_notes", "issue notes", {
    column: "created_at",
    ascending: true,
  }),
);

export const listActionItems = cache(async () =>
  readTable<ActionItemRow>("action_items", "action items", {
    column: "due_date",
    ascending: true,
  }),
);

export const listDecisions = cache(async () =>
  readTable<DecisionRow>("decisions", "decisions", {
    column: "decided_at",
    ascending: false,
  }),
);

export const listReviews = cache(async () =>
  readTable<PerformanceReviewRow>("performance_reviews", "performance reviews", {
    column: "created_at",
    ascending: false,
  }),
);

export const listReviewManagerNotes = cache(async () =>
  readTable<PerformanceReviewManagerNoteRow>(
    "performance_review_manager_notes",
    "manager review notes",
    { column: "updated_at", ascending: false },
  ),
);

export async function getMeeting(id: string) {
  if (!isSupabaseConfigured) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Could not load meeting:", error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Could not load meeting:", error);
    return null;
  }
}

export async function getIssue(id: string) {
  if (!isSupabaseConfigured) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("issues")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Could not load issue:", error.message);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Could not load issue:", error);
    return null;
  }
}

export type ProfileName = {
  id: string;
  name: string;
};

export const listVisibleProfileOptions = cache(async () => {
  if (!isSupabaseConfigured) return [] as ProfileName[];

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, display_name, email, active")
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Could not load performance profile picker:", error.message);
      return [] as ProfileName[];
    }

    return ((data ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
      email: string | null;
      active: boolean;
    }[]).map((profile) => ({
      id: profile.id,
      name: formatProfileName(profile),
    }));
  } catch (error) {
    console.error("Could not load performance profile picker:", error);
    return [] as ProfileName[];
  }
});

export async function profileNamesFor(ids: readonly (string | null | undefined)[]) {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0 || !isSupabaseConfigured) return new Map<string, string>();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, display_name, email")
      .in("id", uniqueIds);

    if (error) {
      console.error("Could not load performance profile names:", error.message);
      return new Map<string, string>();
    }

    const names = new Map<string, string>();
    for (const profile of (data ?? []) as {
      id: string;
      first_name: string | null;
      last_name: string | null;
      display_name: string | null;
      email: string | null;
    }[]) {
      names.set(profile.id, formatProfileName(profile));
    }

    return names;
  } catch (error) {
    console.error("Could not load performance profile names:", error);
    return new Map<string, string>();
  }
}
