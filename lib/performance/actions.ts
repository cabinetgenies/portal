"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import { getSessionContext } from "@/lib/auth/dal";
import {
  failureState,
  formDataToObject,
  successState,
  validationErrorState,
  type ActionState,
} from "@/lib/forms/action-state";
import { mutationErrorState } from "@/lib/forms/mutation-errors";
import {
  actionCreateSchema,
  decisionCreateSchema,
  headlineCreateSchema,
  issueCreateSchema,
  issueNoteCreateSchema,
  issueResolveSchema,
  measurableCreateSchema,
  meetingCreateSchema,
  priorityCreateSchema,
  reviewCreateSchema,
  scorecardEntrySchema,
} from "@/lib/performance/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Performance & Leadership Server Actions.
 *
 * Every action verifies authorization first, then Postgres Row Level Security
 * checks the write a second time. Reads and writes are deliberately small: this
 * phase builds a clean baseline, not a workflow engine.
 */

function revalidatePerformance() {
  revalidatePath("/performance");
  revalidatePath("/performance/scorecards");
  revalidatePath("/performance/priorities");
  revalidatePath("/performance/meetings");
  revalidatePath("/performance/issues");
  revalidatePath("/performance/reviews");
  revalidatePath("/people");
}

function revalidateMeeting(meetingId?: string | null) {
  revalidatePerformance();
  if (meetingId) revalidatePath(`/performance/meetings/${meetingId}`);
}

function revalidateIssue(issueId?: string | null) {
  revalidatePerformance();
  if (issueId) revalidatePath(`/performance/issues/${issueId}`);
}

async function requireAuthorizedUser(): Promise<
  { userId: string } | { denied: ActionState }
> {
  const session = await getSessionContext();
  if (!session) {
    return { denied: failureState("Your session has expired. Sign in again to continue.") };
  }
  if (session.status !== "authorized") {
    return {
      denied: failureState(
        "Your account does not have access to the portal. Ask an administrator to activate your profile.",
      ),
    };
  }
  return { userId: session.userId };
}

// ---------------------------------------------------------------------------
// Scorecards
// ---------------------------------------------------------------------------

export async function createMeasurable(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = measurableCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("performance_measurables").insert({
    name: parsed.data.name,
    scope: parsed.data.scope,
    owner_profile_id: parsed.data.ownerProfileId,
    department_id: parsed.data.departmentId,
    employee_id: parsed.data.employeeId,
    target: parsed.data.target,
    unit: parsed.data.unit,
    frequency: parsed.data.frequency,
    current_value: null,
    status: parsed.data.status,
    notes: parsed.data.notes,
    knowledge_item_id: parsed.data.knowledgeItemId,
    active: parsed.data.active,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Measurable added. Historical entries are kept separately and are never overwritten.");
}

export async function recordScorecardEntry(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = scorecardEntrySchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("performance_scorecard_entries").insert({
    measurable_id: parsed.data.measurableId,
    period_start: parsed.data.periodStart,
    period_end: parsed.data.periodEnd,
    target_snapshot: parsed.data.targetSnapshot,
    actual_value: parsed.data.actualValue,
    status: parsed.data.status,
    entered_by: auth.userId,
    notes: parsed.data.notes,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Scorecard entry recorded for that period.");
}

// ---------------------------------------------------------------------------
// Quarterly priorities
// ---------------------------------------------------------------------------

export async function createPriority(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = priorityCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("quarterly_priorities").insert({
    title: parsed.data.title,
    description: parsed.data.description,
    owner_profile_id: parsed.data.ownerProfileId,
    department_id: parsed.data.departmentId,
    quarter: parsed.data.quarter,
    year: parsed.data.year,
    due_date: parsed.data.dueDate,
    status: parsed.data.status,
    percent_complete: parsed.data.percentComplete,
    notes: parsed.data.notes,
    knowledge_item_id: parsed.data.knowledgeItemId,
    created_by: auth.userId,
    completed_at: parsed.data.status === "complete" ? new Date().toISOString() : null,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Quarterly priority added.");
}

export async function updatePriorityStatus(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAuthorizedUser();
  if ("denied" in user) return user.denied;

  const priorityId = String(formData.get("priorityId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const percentComplete = Number(String(formData.get("percentComplete") ?? "0"));

  if (!priorityId) return failureState("A priority is required.");
  if (!["not_started", "on_track", "at_risk", "off_track", "complete"].includes(status)) {
    return failureState("That priority status is not valid.");
  }
  if (!Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100) {
    return failureState("Percent complete must be between 0 and 100.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("quarterly_priorities")
    .update({
      status,
      percent_complete: Math.round(percentComplete),
      completed_at: status === "complete" ? new Date().toISOString() : null,
    })
    .eq("id", priorityId);

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Priority updated.");
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export async function createMeeting(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = meetingCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("meetings").insert({
    meeting_template_id: parsed.data.meetingTemplateId,
    meeting_type: parsed.data.meetingType,
    team_department_id: parsed.data.teamDepartmentId,
    meeting_date: parsed.data.meetingDate,
    status: "scheduled",
    notes: parsed.data.notes,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Meeting scheduled.");
}

export async function completeMeeting(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const meetingId = String(formData.get("meetingId") ?? "").trim();
  if (!meetingId) return failureState("A meeting is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("meetings")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", meetingId);

  if (error) return mutationErrorState(error, "performance");

  revalidateMeeting(meetingId);
  return successState("Meeting completed.");
}

export async function createHeadline(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = headlineCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("meeting_headlines").insert({
    meeting_id: parsed.data.meetingId,
    title: parsed.data.title,
    note: parsed.data.note,
    type: parsed.data.type,
    department_id: parsed.data.departmentId,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidateMeeting(parsed.data.meetingId);
  return successState("Headline added.");
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export async function createIssue(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = issueCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("issues").insert({
    title: parsed.data.title,
    description: parsed.data.description,
    department_id: parsed.data.departmentId,
    owner_profile_id: parsed.data.ownerProfileId,
    priority: parsed.data.priority,
    status: parsed.data.status,
    source: parsed.data.source,
    source_id: parsed.data.sourceId,
    meeting_id: parsed.data.meetingId,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Issue raised.");
}

export async function addIssueNote(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = issueNoteCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("issue_notes").insert({
    issue_id: parsed.data.issueId,
    author_profile_id: auth.userId,
    body: parsed.data.body,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidateIssue(parsed.data.issueId);
  return successState("Discussion note added.");
}

export async function resolveIssue(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = issueResolveSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const decisionResult = await supabase.from("decisions").insert({
    title: `Decision: ${parsed.data.issueId}`,
    decision: parsed.data.decision,
    issue_id: parsed.data.issueId,
    decided_by: auth.userId,
  });

  if (decisionResult.error) return mutationErrorState(decisionResult.error, "performance");

  const { error } = await supabase
    .from("issues")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.issueId);

  if (error) return mutationErrorState(error, "performance");

  revalidateIssue(parsed.data.issueId);
  return successState("Issue resolved and decision recorded.");
}

// ---------------------------------------------------------------------------
// Action items and decisions
// ---------------------------------------------------------------------------

export async function createActionItem(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = actionCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("action_items").insert({
    title: parsed.data.title,
    description: parsed.data.description,
    owner_profile_id: parsed.data.ownerProfileId,
    department_id: parsed.data.departmentId,
    source: parsed.data.source,
    source_id: parsed.data.sourceId,
    meeting_id: parsed.data.meetingId,
    due_date: parsed.data.dueDate,
    status: "open",
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidateMeeting(parsed.data.meetingId);
  return successState("Action item added.");
}

export async function completeActionItem(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAuthorizedUser();
  if ("denied" in user) return user.denied;

  const actionId = String(formData.get("actionId") ?? "").trim();
  if (!actionId) return failureState("An action item is required.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("action_items")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", actionId);

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Action item completed.");
}

export async function recordDecision(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("manage:performance");
  if ("denied" in auth) return auth.denied;

  const parsed = decisionCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("decisions").insert({
    title: parsed.data.title,
    decision: parsed.data.decision,
    issue_id: parsed.data.issueId,
    meeting_id: parsed.data.meetingId,
    department_id: parsed.data.departmentId,
    decided_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidateMeeting(parsed.data.meetingId);
  return successState("Decision recorded.");
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function createReview(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const auth = await authorizeCapability("view:performance-team");
  if ("denied" in auth) return auth.denied;

  const parsed = reviewCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("performance_reviews").insert({
    employee_id: parsed.data.employeeId,
    manager_id: parsed.data.managerId ?? auth.userId,
    period_start: parsed.data.periodStart,
    period_end: parsed.data.periodEnd,
    status: parsed.data.status,
    scheduled_date: parsed.data.scheduledDate,
    manager_notes: parsed.data.managerNotes,
    created_by: auth.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Review created.");
}

export async function updateReview(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAuthorizedUser();
  if ("denied" in user) return user.denied;

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const notesField = String(formData.get("notesField") ?? "manager_notes").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!reviewId) return failureState("A review is required.");
  if (!["not_started", "in_progress", "employee_input", "manager_review", "complete"].includes(status)) {
    return failureState("That review status is not valid.");
  }

  const payload: {
    status: string;
    employee_notes?: string | null;
    manager_notes?: string | null;
  } = { status };
  if (notesField === "employee_notes") {
    payload.employee_notes = notes.length > 0 ? notes : null;
  } else {
    payload.manager_notes = notes.length > 0 ? notes : null;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("performance_reviews")
    .update(payload)
    .eq("id", reviewId);

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Review updated.");
}
