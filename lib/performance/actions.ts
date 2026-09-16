"use server";

import { revalidatePath } from "next/cache";

import { authorizeCapability } from "@/lib/auth/authorize";
import { getSessionContext, type AuthorizedSession } from "@/lib/auth/dal";
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
  managerReviewSchema,
  meetingCreateSchema,
  meetingParticipantSchema,
  priorityCreateSchema,
  reviewCreateSchema,
  reviewInputSchema,
  scorecardEntrySchema,
} from "@/lib/performance/validation";
import {
  canFinalizeReview,
  employeeReviewTransitionAllowed,
  reviewActorFor,
} from "@/lib/performance/review-authorization";
import { priorityInReviewPeriod } from "@/lib/performance/model";
import type { Json, PerformanceReviewRow } from "@/lib/supabase/database.types";
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

async function requireAuthorizedSession(): Promise<
  { session: AuthorizedSession } | { denied: ActionState }
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
  return { session };
}

function isPerformanceAdmin(session: AuthorizedSession) {
  return (
    session.capabilities.includes("manage:performance") ||
    session.capabilities.includes("administer:portal")
  );
}

async function getReview(
  reviewId: string,
): Promise<PerformanceReviewRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("performance_reviews")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();

  if (error) {
    console.error("Could not load review:", error.message);
    return null;
  }

  return data;
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

export async function addMeetingParticipant(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await requireAuthorizedSession();
  if ("denied" in result) return result.denied;

  const parsed = meetingParticipantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: canManage, error: canManageError } = await supabase.rpc(
    "can_manage_meeting",
    { target_meeting_id: parsed.data.meetingId },
  );

  if (canManageError || !canManage) {
    return failureState("Only an authorized meeting organizer can manage participants.");
  }

  const { error } = await supabase.from("meeting_participants").insert({
    meeting_id: parsed.data.meetingId,
    profile_id: parsed.data.profileId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidateMeeting(parsed.data.meetingId);
  return successState("Participant added.");
}

export async function removeMeetingParticipant(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await requireAuthorizedSession();
  if ("denied" in result) return result.denied;

  const parsed = meetingParticipantSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: canManage, error: canManageError } = await supabase.rpc(
    "can_manage_meeting",
    { target_meeting_id: parsed.data.meetingId },
  );

  if (canManageError || !canManage) {
    return failureState("Only an authorized meeting organizer can manage participants.");
  }

  const { error } = await supabase
    .from("meeting_participants")
    .delete()
    .eq("meeting_id", parsed.data.meetingId)
    .eq("profile_id", parsed.data.profileId);

  if (error) return mutationErrorState(error, "performance");

  revalidateMeeting(parsed.data.meetingId);
  return successState("Participant removed.");
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
  const result = await requireAuthorizedSession();
  if ("denied" in result) return result.denied;
  const { session } = result;

  if (!session.capabilities.includes("view:performance-team")) {
    return failureState("Your role cannot create performance reviews.");
  }

  const parsed = reviewCreateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const supabase = await createSupabaseServerClient();
  const employeeResult = await supabase
    .from("profiles")
    .select("id, manager_id, active")
    .eq("id", parsed.data.employeeId)
    .maybeSingle();

  if (employeeResult.error || !employeeResult.data) {
    return failureState("That employee does not exist.");
  }

  const isAdmin = isPerformanceAdmin(session);
  if (!isAdmin && employeeResult.data.manager_id !== session.userId) {
    return failureState("Only the employee's assigned manager or an administrator can create this review.");
  }

  const managerId = employeeResult.data.manager_id ?? session.userId;
  const { error } = await supabase.from("performance_reviews").insert({
    employee_id: parsed.data.employeeId,
    manager_id: managerId,
    period_start: parsed.data.periodStart,
    period_end: parsed.data.periodEnd,
    status: "not_started",
    scheduled_date: parsed.data.scheduledDate,
    created_by: session.userId,
  });

  if (error) return mutationErrorState(error, "performance");

  revalidatePerformance();
  return successState("Review created.");
}

export async function submitReviewInput(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await requireAuthorizedSession();
  if ("denied" in result) return result.denied;
  const { session } = result;

  const parsed = reviewInputSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const review = await getReview(parsed.data.reviewId);
  if (!review) return failureState("Review not found or no longer available.");

  const actor = reviewActorFor({
    userId: session.userId,
    employeeId: review.employee_id,
    managerId: review.manager_id,
    isAdmin: isPerformanceAdmin(session),
  });

  if (!actor.isEmployee) {
    return failureState("Only the review employee can submit employee input.");
  }

  if (!employeeReviewTransitionAllowed(review.status, "employee_input")) {
    return failureState("This review is already complete or is not ready for employee input.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("performance_reviews")
    .update({
      employee_notes: parsed.data.notes,
      status: "employee_input",
    })
    .eq("id", parsed.data.reviewId)
    .eq("employee_id", session.userId)
    .select("id");

  if (error) return mutationErrorState(error, "performance");
  if ((data ?? []).length === 0) {
    return failureState("Review not found or you are not allowed to update it.");
  }

  revalidatePerformance();
  return successState("Employee review input submitted.");
}

export async function updateReview(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await requireAuthorizedSession();
  if ("denied" in result) return result.denied;
  const { session } = result;

  const parsed = managerReviewSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationErrorState(parsed.error);

  const review = await getReview(parsed.data.reviewId);
  if (!review) return failureState("Review not found or no longer available.");

  const actor = reviewActorFor({
    userId: session.userId,
    employeeId: review.employee_id,
    managerId: review.manager_id,
    isAdmin: isPerformanceAdmin(session),
  });

  if (!actor.canManage) {
    return failureState("Only the assigned manager or an administrator can update manager review fields.");
  }

  if (review.status === "complete") {
    return failureState("A completed review cannot be changed.");
  }

  if (parsed.data.status === "complete" && !canFinalizeReview(actor, review.status)) {
    return failureState("Only the assigned manager or an administrator can finalize this review.");
  }

  const supabase = await createSupabaseServerClient();
  const finalizing = parsed.data.status === "complete";
  let snapshotData: Json | null = review.snapshot_data;

  if (finalizing) {
    const snapshot = await buildReviewSnapshot(supabase, review, session.userId);
    if (!snapshot.ok) {
      return failureState(snapshot.error);
    }
    snapshotData = snapshot.data;
  }

  const { data: saved, error } = await supabase.rpc("save_manager_review", {
    p_review_id: parsed.data.reviewId,
    p_status: parsed.data.status,
    p_manager_notes: parsed.data.managerNotes,
    p_overall_summary: parsed.data.overallSummary,
    p_development_actions: parsed.data.developmentActions,
    p_snapshot_data: snapshotData,
  });

  if (error) return mutationErrorState(error, "performance");
  if (!saved) return failureState("Review not found or you are not allowed to update it.");

  revalidatePerformance();
  return successState(finalizing ? "Review finalized." : "Manager review updated.");
}

async function buildReviewSnapshot(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  review: PerformanceReviewRow,
  finalizedBy: string,
): Promise<{ ok: true; data: Json } | { ok: false; error: string }> {
  const [employeeResult, measurablesResult, prioritiesResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("business_role_id")
      .eq("id", review.employee_id)
      .maybeSingle(),
    supabase
      .from("performance_measurables")
      .select("id, name, target, unit, status")
      .eq("scope", "employee")
      .eq("employee_id", review.employee_id),
    supabase
      .from("quarterly_priorities")
      .select("id, title, quarter, year, status, percent_complete, due_date")
      .eq("owner_profile_id", review.employee_id)
      .order("year", { ascending: false })
      .order("quarter", { ascending: false }),
  ]);

  if (employeeResult.error) {
    return { ok: false, error: "Could not load the employee's role evidence." };
  }
  if (measurablesResult.error) {
    return { ok: false, error: "Could not load scorecard evidence." };
  }
  if (prioritiesResult.error) {
    return { ok: false, error: "Could not load priority evidence." };
  }

  const businessRoleId = employeeResult.data?.business_role_id ?? null;
  const roleExpectations = businessRoleId
    ? await supabase
        .from("knowledge_items")
        .select("id, title, slug, body, updated_at")
        .eq("type", "role_expectation")
        .eq("business_role_id", businessRoleId)
        .eq("status", "published")
    : { data: [], error: null };

  if (roleExpectations.error) {
    return { ok: false, error: "Could not load role expectation evidence." };
  }

  const measurableIds = (measurablesResult.data ?? []).map((measurable) => measurable.id);
  let entriesQuery = supabase
    .from("performance_scorecard_entries")
    .select("id, measurable_id, period_start, period_end, target_snapshot, actual_value, status")
    .in("measurable_id", measurableIds);

  const hasReviewPeriod = Boolean(review.period_start && review.period_end);
  if (hasReviewPeriod && review.period_start && review.period_end) {
    entriesQuery = entriesQuery
      .lte("period_start", review.period_end)
      .gte("period_end", review.period_start);
  }
  entriesQuery = entriesQuery.order("period_start", { ascending: false });

  const entries = measurableIds.length > 0
    ? await entriesQuery
    : { data: [], error: null };

  if (entries.error) {
    return { ok: false, error: "Could not load scorecard entry evidence." };
  }

  const entriesByMeasurable = new Map<string, typeof entries.data>();
  for (const entry of entries.data ?? []) {
    const list = entriesByMeasurable.get(entry.measurable_id) ?? [];
    list.push(entry);
    entriesByMeasurable.set(entry.measurable_id, list);
  }

  const selectedPriorities = (prioritiesResult.data ?? [])
    .filter((priority) =>
      priorityInReviewPeriod(
        priority,
        review.period_start,
        review.period_end,
      ),
    )
    .map((priority) => ({
      ...priority,
      selection_context: hasReviewPeriod ? "in_review_period" : "no_review_period",
    }));

  const evidence = {
    role_expectations: roleExpectations.data ?? [],
    measurables: (measurablesResult.data ?? []).map((measurable) => {
      const measurableEntries = entriesByMeasurable.get(measurable.id) ?? [];
      return {
        id: measurable.id,
        name: measurable.name,
        target: measurable.target,
        unit: measurable.unit,
        status: measurable.status,
        entries: measurableEntries,
        context: hasReviewPeriod ? "in_review_period" : "latest_available",
        absent: measurableEntries.length === 0,
      };
    }),
    priorities: selectedPriorities,
    period: {
      start: review.period_start,
      end: review.period_end,
      stated: hasReviewPeriod,
    },
  };

  if (!hasReviewPeriod && measurableIds.length > 0) {
    // Keep only the latest entry per measurable when no period was provided, and
    // label it explicitly as outside-period context rather than pretending it
    // belongs to a period that was never set.
    for (const measurable of evidence.measurables) {
      measurable.entries = measurable.entries.slice(0, 1);
      measurable.context = "latest_available_outside_review_period";
    }
  }

  return {
    ok: true,
    data: {
      finalized_at: new Date().toISOString(),
      finalized_by: finalizedBy,
      employee_id: review.employee_id,
      manager_id: review.manager_id,
      evidence,
    } as unknown as Json,
  };
}
