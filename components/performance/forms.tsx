"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import {
  CheckboxField,
  Field,
  FormAlert,
  Select,
  SubmitButton,
  Textarea,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import {
  addIssueNote,
  completeActionItem,
  completeMeeting,
  createActionItem,
  createIssue,
  createHeadline,
  createMeasurable,
  createMeeting,
  createPriority,
  createReview,
  recordDecision,
  recordScorecardEntry,
  resolveIssue,
  updatePriorityStatus,
  updateReview,
} from "@/lib/performance/actions";

export type SelectOption = {
  value: string;
  label: string;
};

const emptyOptions: readonly SelectOption[] = [];

function options(
  list: readonly SelectOption[] | undefined,
  placeholder: string,
) {
  return (
    <>
      <option value="">{placeholder}</option>
      {(list ?? emptyOptions).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </>
  );
}

function FormShell({
  state,
  children,
}: {
  state: Awaited<ReturnType<typeof createMeasurable>>;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <FormAlert state={state} />
      {children}
    </div>
  );
}

export function MeasurableForm({
  departments,
  profiles,
}: {
  departments: readonly SelectOption[];
  profiles: readonly SelectOption[];
}) {
  const [state, formAction] = useActionState(createMeasurable, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="measurable-name" error={fieldError(state, "name")}>
            <TextInput id="measurable-name" name="name" required maxLength={120} />
          </Field>
          <Field label="Scope" htmlFor="measurable-scope" error={fieldError(state, "scope")}>
            <Select id="measurable-scope" name="scope" defaultValue="company">
              <option value="company">Company</option>
              <option value="department">Department</option>
              <option value="employee">Employee</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner" htmlFor="measurable-owner">
            <Select id="measurable-owner" name="ownerProfileId">
              {options(profiles, "No owner")}
            </Select>
          </Field>
          <Field label="Department" htmlFor="measurable-department">
            <Select id="measurable-department" name="departmentId">
              {options(departments, "No department")}
            </Select>
          </Field>
          <Field label="Employee" htmlFor="measurable-employee">
            <Select id="measurable-employee" name="employeeId">
              {options(profiles, "No employee")}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Target" htmlFor="measurable-target">
            <TextInput id="measurable-target" name="target" inputMode="decimal" />
          </Field>
          <Field label="Unit" htmlFor="measurable-unit">
            <TextInput id="measurable-unit" name="unit" placeholder="%, $, count" />
          </Field>
          <Field label="Frequency" htmlFor="measurable-frequency">
            <Select id="measurable-frequency" name="frequency" defaultValue="weekly">
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="measurable-status">
            <Select id="measurable-status" name="status" defaultValue="no_data">
              <option value="no_data">No Data</option>
              <option value="on_track">On Track</option>
              <option value="off_track">Off Track</option>
            </Select>
          </Field>
        </div>

        <Field label="Notes" htmlFor="measurable-notes">
          <Textarea id="measurable-notes" name="notes" rows={3} />
        </Field>

        <CheckboxField label="Active measurable" name="active" defaultChecked />
        <SubmitButton label="Add measurable" pendingLabel="Saving…" size="sm" />
      </FormShell>
    </form>
  );
}

export function ScorecardEntryForm({
  measurables,
}: {
  measurables: readonly SelectOption[];
}) {
  const [state, formAction] = useActionState(recordScorecardEntry, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Measurable" htmlFor="entry-measurable" error={fieldError(state, "measurableId")}>
            <Select id="entry-measurable" name="measurableId" required>
              <option value="">Choose a measurable</option>
              {measurables.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor="entry-status">
            <Select id="entry-status" name="status" defaultValue="no_data">
              <option value="no_data">No Data</option>
              <option value="on_track">On Track</option>
              <option value="off_track">Off Track</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Period start" htmlFor="entry-start" error={fieldError(state, "periodStart")}>
            <TextInput id="entry-start" name="periodStart" type="date" required />
          </Field>
          <Field label="Period end" htmlFor="entry-end" error={fieldError(state, "periodEnd")}>
            <TextInput id="entry-end" name="periodEnd" type="date" required />
          </Field>
          <Field label="Target snapshot" htmlFor="entry-target">
            <TextInput id="entry-target" name="targetSnapshot" inputMode="decimal" />
          </Field>
          <Field label="Actual" htmlFor="entry-actual">
            <TextInput id="entry-actual" name="actualValue" inputMode="decimal" />
          </Field>
        </div>

        <Field label="Notes" htmlFor="entry-notes">
          <Textarea id="entry-notes" name="notes" rows={2} />
        </Field>

        <SubmitButton label="Record entry" pendingLabel="Recording…" size="sm" />
      </FormShell>
    </form>
  );
}

export function PriorityForm({
  departments,
  profiles,
  defaultYear,
  defaultQuarter,
}: {
  departments: readonly SelectOption[];
  profiles: readonly SelectOption[];
  defaultYear: number;
  defaultQuarter: number;
}) {
  const [state, formAction] = useActionState(createPriority, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <Field label="Title" htmlFor="priority-title" error={fieldError(state, "title")}>
          <TextInput id="priority-title" name="title" required maxLength={160} />
        </Field>
        <Field label="Description" htmlFor="priority-description">
          <Textarea id="priority-description" name="description" rows={3} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Owner" htmlFor="priority-owner">
            <Select id="priority-owner" name="ownerProfileId">
              {options(profiles, "No owner")}
            </Select>
          </Field>
          <Field label="Department" htmlFor="priority-department">
            <Select id="priority-department" name="departmentId">
              {options(departments, "Company-wide")}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Quarter" htmlFor="priority-quarter">
            <Select id="priority-quarter" name="quarter" defaultValue={String(defaultQuarter)}>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </Select>
          </Field>
          <Field label="Year" htmlFor="priority-year">
            <TextInput id="priority-year" name="year" type="number" defaultValue={defaultYear} required />
          </Field>
          <Field label="Due date" htmlFor="priority-due">
            <TextInput id="priority-due" name="dueDate" type="date" />
          </Field>
          <Field label="Status" htmlFor="priority-status">
            <Select id="priority-status" name="status" defaultValue="not_started">
              <option value="not_started">Not Started</option>
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="off_track">Off Track</option>
              <option value="complete">Complete</option>
            </Select>
          </Field>
        </div>

        <Field label="Percent complete" htmlFor="priority-percent">
          <TextInput id="priority-percent" name="percentComplete" type="number" min={0} max={100} defaultValue={0} />
        </Field>
        <Field label="Notes" htmlFor="priority-notes">
          <Textarea id="priority-notes" name="notes" rows={2} />
        </Field>

        <SubmitButton label="Add priority" pendingLabel="Saving…" size="sm" />
      </FormShell>
    </form>
  );
}

export function MeetingForm({
  templates,
  departments,
}: {
  templates: readonly SelectOption[];
  departments: readonly SelectOption[];
}) {
  const [state, formAction] = useActionState(createMeeting, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Template" htmlFor="meeting-template">
            <Select id="meeting-template" name="meetingTemplateId">
              {options(templates, "No template")}
            </Select>
          </Field>
          <Field label="Meeting type" htmlFor="meeting-type">
            <Select id="meeting-type" name="meetingType" defaultValue="leadership">
              <option value="leadership">Leadership</option>
              <option value="department">Department</option>
            </Select>
          </Field>
          <Field label="Department" htmlFor="meeting-department">
            <Select id="meeting-department" name="teamDepartmentId">
              {options(departments, "Company-wide")}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meeting date" htmlFor="meeting-date" error={fieldError(state, "meetingDate")}>
            <TextInput id="meeting-date" name="meetingDate" type="date" required />
          </Field>
          <Field label="Notes" htmlFor="meeting-notes">
            <TextInput id="meeting-notes" name="notes" />
          </Field>
        </div>

        <SubmitButton label="Schedule meeting" pendingLabel="Scheduling…" size="sm" />
      </FormShell>
    </form>
  );
}

export function HeadlineForm({
  meetingId,
  departments,
}: {
  meetingId: string;
  departments: readonly SelectOption[];
}) {
  const [state, formAction] = useActionState(createHeadline, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="meetingId" value={meetingId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Headline" htmlFor={`headline-title-${meetingId}`}>
            <TextInput id={`headline-title-${meetingId}`} name="title" required maxLength={160} />
          </Field>
          <Field label="Type" htmlFor={`headline-type-${meetingId}`}>
            <TextInput id={`headline-type-${meetingId}`} name="type" placeholder="Good, bad, blocker" />
          </Field>
        </div>
        <Field label="Note" htmlFor={`headline-note-${meetingId}`}>
          <Textarea id={`headline-note-${meetingId}`} name="note" rows={2} />
        </Field>
        <Field label="Department" htmlFor={`headline-department-${meetingId}`}>
          <Select id={`headline-department-${meetingId}`} name="departmentId">
            {options(departments, "No department")}
          </Select>
        </Field>
        <SubmitButton label="Add headline" pendingLabel="Adding…" size="sm" />
      </FormShell>
    </form>
  );
}

export function IssueForm({
  departments,
  profiles,
  meetings,
}: {
  departments: readonly SelectOption[];
  profiles: readonly SelectOption[];
  meetings: readonly SelectOption[];
}) {
  const [state, formAction] = useActionState(createIssue, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <Field label="Title" htmlFor="issue-title" error={fieldError(state, "title")}>
          <TextInput id="issue-title" name="title" required maxLength={160} />
        </Field>
        <Field label="Description" htmlFor="issue-description">
          <Textarea id="issue-description" name="description" rows={3} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner" htmlFor="issue-owner">
            <Select id="issue-owner" name="ownerProfileId">
              {options(profiles, "No owner")}
            </Select>
          </Field>
          <Field label="Department" htmlFor="issue-department">
            <Select id="issue-department" name="departmentId">
              {options(departments, "No department")}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="issue-priority">
            <Select id="issue-priority" name="priority" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="issue-status">
            <Select id="issue-status" name="status" defaultValue="open">
              <option value="open">Open</option>
              <option value="discussing">Discussing</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Source" htmlFor="issue-source">
            <Select id="issue-source" name="source" defaultValue="manual">
              <option value="manual">Manual</option>
              <option value="meeting">Meeting</option>
              <option value="scorecard">Scorecard</option>
              <option value="quarterly_priority">Quarterly Priority</option>
              <option value="review">Review</option>
            </Select>
          </Field>
          <Field label="Meeting" htmlFor="issue-meeting">
            <Select id="issue-meeting" name="meetingId">
              {options(meetings, "No meeting")}
            </Select>
          </Field>
        </div>

        <SubmitButton label="Raise issue" pendingLabel="Saving…" size="sm" />
      </FormShell>
    </form>
  );
}

export function ActionItemForm({
  departments,
  profiles,
  meetings,
  fixedMeetingId,
}: {
  departments: readonly SelectOption[];
  profiles: readonly SelectOption[];
  meetings: readonly SelectOption[];
  fixedMeetingId?: string;
}) {
  const [state, formAction] = useActionState(createActionItem, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        {fixedMeetingId ? <input type="hidden" name="meetingId" value={fixedMeetingId} /> : null}

        <Field label="Title" htmlFor="action-title" error={fieldError(state, "title")}>
          <TextInput id="action-title" name="title" required maxLength={160} />
        </Field>
        <Field label="Description" htmlFor="action-description">
          <Textarea id="action-description" name="description" rows={2} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner" htmlFor="action-owner">
            <Select id="action-owner" name="ownerProfileId">
              {options(profiles, "No owner")}
            </Select>
          </Field>
          <Field label="Department" htmlFor="action-department">
            <Select id="action-department" name="departmentId">
              {options(departments, "No department")}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="action-due">
            <TextInput id="action-due" name="dueDate" type="date" />
          </Field>
        </div>

        {!fixedMeetingId ? (
          <Field label="Meeting" htmlFor="action-meeting">
            <Select id="action-meeting" name="meetingId">
              {options(meetings, "No meeting")}
            </Select>
          </Field>
        ) : null}

        <Field label="Source" htmlFor="action-source">
          <Select id="action-source" name="source" defaultValue={fixedMeetingId ? "meeting" : "manual"}>
            <option value="manual">Manual</option>
            <option value="meeting">Meeting</option>
            <option value="issue">Issue</option>
            <option value="review">Review</option>
            <option value="quarterly_priority">Quarterly Priority</option>
          </Select>
        </Field>

        <SubmitButton label="Add action item" pendingLabel="Saving…" size="sm" />
      </FormShell>
    </form>
  );
}

export function DecisionForm({
  departments,
  meetings,
  issues,
  fixedMeetingId,
}: {
  departments: readonly SelectOption[];
  meetings: readonly SelectOption[];
  issues: readonly SelectOption[];
  fixedMeetingId?: string;
}) {
  const [state, formAction] = useActionState(recordDecision, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        {fixedMeetingId ? <input type="hidden" name="meetingId" value={fixedMeetingId} /> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="decision-title" error={fieldError(state, "title")}>
            <TextInput id="decision-title" name="title" required maxLength={160} />
          </Field>
          <Field label="Department" htmlFor="decision-department">
            <Select id="decision-department" name="departmentId">
              {options(departments, "No department")}
            </Select>
          </Field>
        </div>

        <Field label="Decision" htmlFor="decision-text" error={fieldError(state, "decision")}>
          <Textarea id="decision-text" name="decision" required rows={3} />
        </Field>

        {!fixedMeetingId ? (
          <Field label="Meeting" htmlFor="decision-meeting">
            <Select id="decision-meeting" name="meetingId">
              {options(meetings, "No meeting")}
            </Select>
          </Field>
        ) : null}

        <Field label="Related issue" htmlFor="decision-issue">
          <Select id="decision-issue" name="issueId">
            {options(issues, "No issue")}
          </Select>
        </Field>

        <SubmitButton label="Record decision" pendingLabel="Recording…" size="sm" />
      </FormShell>
    </form>
  );
}

export function ReviewForm({
  employees,
  managers,
}: {
  employees: readonly SelectOption[];
  managers: readonly SelectOption[];
}) {
  const [state, formAction] = useActionState(createReview, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee" htmlFor="review-employee" error={fieldError(state, "employeeId")}>
            <Select id="review-employee" name="employeeId" required>
              <option value="">Choose an employee</option>
              {employees.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Manager" htmlFor="review-manager">
            <Select id="review-manager" name="managerId">
              {options(managers, "You (the signed-in manager)")}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Period start" htmlFor="review-period-start">
            <TextInput id="review-period-start" name="periodStart" type="date" />
          </Field>
          <Field label="Period end" htmlFor="review-period-end">
            <TextInput id="review-period-end" name="periodEnd" type="date" />
          </Field>
          <Field label="Scheduled date" htmlFor="review-scheduled">
            <TextInput id="review-scheduled" name="scheduledDate" type="date" />
          </Field>
          <Field label="Status" htmlFor="review-status">
            <Select id="review-status" name="status" defaultValue="not_started">
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="employee_input">Employee Input</option>
              <option value="manager_review">Manager Review</option>
              <option value="complete">Complete</option>
            </Select>
          </Field>
        </div>

        <Field label="Manager notes" htmlFor="review-manager-notes">
          <Textarea id="review-manager-notes" name="managerNotes" rows={3} />
        </Field>

        <SubmitButton label="Create review" pendingLabel="Creating…" size="sm" />
      </FormShell>
    </form>
  );
}

export function IssueNoteForm({ issueId }: { issueId: string }) {
  const [state, formAction] = useActionState(addIssueNote, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="issueId" value={issueId} />
        <Field label="Discussion note" htmlFor={`issue-note-${issueId}`}>
          <Textarea id={`issue-note-${issueId}`} name="body" required rows={3} />
        </Field>
        <SubmitButton label="Add note" pendingLabel="Adding…" size="sm" />
      </FormShell>
    </form>
  );
}

export function ResolveIssueForm({ issueId }: { issueId: string }) {
  const [state, formAction] = useActionState(resolveIssue, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="issueId" value={issueId} />
        <Field label="Decision" htmlFor={`resolve-issue-${issueId}`}>
          <Textarea id={`resolve-issue-${issueId}`} name="decision" required rows={3} />
        </Field>
        <SubmitButton label="Resolve with decision" pendingLabel="Resolving…" size="sm" />
      </FormShell>
    </form>
  );
}

export function CompleteActionForm({ actionId }: { actionId: string }) {
  const [state, formAction] = useActionState(completeActionItem, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="actionId" value={actionId} />
        <SubmitButton label="Mark complete" pendingLabel="Completing…" size="sm" />
      </FormShell>
    </form>
  );
}

export function CompleteMeetingForm({ meetingId }: { meetingId: string }) {
  const [state, formAction] = useActionState(completeMeeting, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="meetingId" value={meetingId} />
        <SubmitButton label="Complete meeting" pendingLabel="Completing…" size="sm" />
      </FormShell>
    </form>
  );
}

export function PriorityStatusForm({
  priorityId,
  status,
  percentComplete,
}: {
  priorityId: string;
  status: string;
  percentComplete: number;
}) {
  const [state, formAction] = useActionState(updatePriorityStatus, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="priorityId" value={priorityId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status" htmlFor={`priority-status-${priorityId}`}>
            <Select id={`priority-status-${priorityId}`} name="status" defaultValue={status}>
              <option value="not_started">Not Started</option>
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="off_track">Off Track</option>
              <option value="complete">Complete</option>
            </Select>
          </Field>
          <Field label="Percent complete" htmlFor={`priority-percent-${priorityId}`}>
            <TextInput
              id={`priority-percent-${priorityId}`}
              name="percentComplete"
              type="number"
              min={0}
              max={100}
              defaultValue={percentComplete}
            />
          </Field>
          <div className="flex items-end">
            <SubmitButton label="Update" pendingLabel="Saving…" size="sm" />
          </div>
        </div>
      </FormShell>
    </form>
  );
}

export function ReviewStatusForm({
  reviewId,
  status,
  notesField,
  notes,
}: {
  reviewId: string;
  status: string;
  notesField: "manager_notes" | "employee_notes";
  notes: string;
}) {
  const [state, formAction] = useActionState(updateReview, undefined);

  return (
    <form action={formAction}>
      <FormShell state={state}>
        <input type="hidden" name="reviewId" value={reviewId} />
        <input type="hidden" name="notesField" value={notesField} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Status" htmlFor={`review-status-${reviewId}`}>
            <Select id={`review-status-${reviewId}`} name="status" defaultValue={status}>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="employee_input">Employee Input</option>
              <option value="manager_review">Manager Review</option>
              <option value="complete">Complete</option>
            </Select>
          </Field>
          <Field label={notesField === "employee_notes" ? "Employee notes" : "Manager notes"} htmlFor={`review-notes-${reviewId}`}>
            <Textarea id={`review-notes-${reviewId}`} name="notes" rows={2} defaultValue={notes} />
          </Field>
          <div className="flex items-end">
            <SubmitButton label="Update" pendingLabel="Saving…" size="sm" />
          </div>
        </div>
      </FormShell>
    </form>
  );
}
