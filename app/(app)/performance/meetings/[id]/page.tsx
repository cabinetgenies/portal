import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import {
  ActionItemForm,
  AddMeetingParticipantForm,
  CompleteMeetingForm,
  DecisionForm,
  HeadlineForm,
  IssueForm,
  RemoveMeetingParticipantForm,
  type SelectOption,
} from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import {
  actionStatusLabel,
  actionStatusTone,
  issuePriorityLabel,
  issuePriorityTone,
  issueStatusLabel,
  issueStatusTone,
} from "@/lib/performance/model";
import {
  getMeeting,
  listActionItems,
  listDecisions,
  listIssueNotes,
  listIssues,
  listMeetingAgendaSections,
  listMeetingHeadlines,
  listMeetingParticipants,
  listVisibleProfileOptions,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate, formatDateTime, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Meeting",
};

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const canManage = session.capabilities.includes("manage:performance");
  const canManageMeeting =
    session.capabilities.includes("manage:performance") ||
    session.capabilities.includes("administer:portal");
  const { id } = await params;
  const meeting = await getMeeting(id);

  if (!meeting) notFound();
  const canManageThisMeeting = canManageMeeting || meeting.created_by === session.userId;

  const [sections, headlines, issues, actions, decisions, notes, participants, catalog, profiles] =
    await Promise.all([
      listMeetingAgendaSections(),
      listMeetingHeadlines(),
      listIssues(),
      listActionItems(),
      listDecisions(),
      listIssueNotes(),
      listMeetingParticipants(),
      loadExperienceCatalog(),
      canManageThisMeeting ? listVisibleProfileOptions() : Promise.resolve([]),
    ]);

  const meetingSections = sections
    .filter((section) => section.meeting_template_id === meeting.meeting_template_id)
    .sort((a, b) => a.display_order - b.display_order);
  const meetingHeadlines = headlines.filter((headline) => headline.meeting_id === meeting.id);
  const meetingIssues = issues.filter((issue) => issue.meeting_id === meeting.id);
  const meetingActions = actions.filter((action) => action.meeting_id === meeting.id);
  const meetingDecisions = decisions.filter((decision) => decision.meeting_id === meeting.id);
  const issueNotesForMeeting = notes.filter((note) =>
    meetingIssues.some((issue) => issue.id === note.issue_id),
  );

  const departmentOptions: SelectOption[] = catalog.departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const profileOptions: SelectOption[] = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
  }));
  const meetingOptions: SelectOption[] = [{ value: meeting.id, label: formatDate(meeting.meeting_date) }];
  const issueOptions: SelectOption[] = meetingIssues.map((issue) => ({
    value: issue.id,
    label: issue.title,
  }));
  const meetingParticipants = participants.filter(
    (participant) => participant.meeting_id === meeting.id,
  );

  const names = await profileNamesFor([
    ...meetingIssues.map((issue) => issue.owner_profile_id),
    ...meetingActions.map((action) => action.owner_profile_id),
    ...meetingDecisions.map((decision) => decision.decided_by),
    ...issueNotesForMeeting.map((note) => note.author_profile_id),
    ...meetingParticipants.map((participant) => participant.profile_id),
  ]);

  const orderedSections = meetingSections.length > 0
    ? meetingSections
    : [
        { id: "scorecard", section_key: "scorecard", title: "Scorecard", display_order: 10, meeting_template_id: null, created_at: "", updated_at: "" },
        { id: "priorities", section_key: "priorities", title: "Quarterly Priorities", display_order: 20, meeting_template_id: null, created_at: "", updated_at: "" },
        { id: "headlines", section_key: "headlines", title: "Headlines", display_order: 30, meeting_template_id: null, created_at: "", updated_at: "" },
        { id: "actions", section_key: "actions", title: "To-Dos / Actions", display_order: 40, meeting_template_id: null, created_at: "", updated_at: "" },
        { id: "issues", section_key: "issues", title: "Issues", display_order: 50, meeting_template_id: null, created_at: "", updated_at: "" },
        { id: "decisions", section_key: "decisions", title: "Decisions / Next Steps", display_order: 60, meeting_template_id: null, created_at: "", updated_at: "" },
      ];

  return (
    <div className="space-y-6">
      <Panel
        id="meeting-summary"
        title={meeting.meeting_type === "leadership" ? "Leadership meeting" : "Department meeting"}
        description="Move through the agenda in order. Actions and issues created here are normal shared records — not meeting-only copies."
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <SummaryItem label="Date" value={formatDate(meeting.meeting_date)} />
          <SummaryItem
            label="Status"
            value={
              meeting.status === "completed"
                ? "Completed"
                : meeting.status === "cancelled"
                  ? "Cancelled"
                  : "Scheduled"
            }
          />
          <SummaryItem label="Notes" value={formatText(meeting.notes)} />
        </dl>
        {meeting.completed_at ? (
          <p className="text-xs text-ink-subtle">Completed {formatDateTime(meeting.completed_at)}</p>
        ) : null}
        {canManage && meeting.status !== "completed" ? (
          <div className="pt-2">
            <CompleteMeetingForm meetingId={meeting.id} />
          </div>
        ) : null}
      </Panel>

      <Panel
        id="meeting-participants"
        title="Participants"
        description="Authorized organizers can add or remove participants. Meeting access is enforced in Postgres, not only by the page."
      >
        {meetingParticipants.length === 0 ? (
          <p className="text-sm text-ink-muted">No participants have been added yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {meetingParticipants.map((participant) => (
              <li
                key={participant.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span>{names.get(participant.profile_id) ?? "Participant"}</span>
                {canManageThisMeeting ? (
                  <RemoveMeetingParticipantForm
                    meetingId={meeting.id}
                    profileId={participant.profile_id}
                    label={names.get(participant.profile_id) ?? "participant"}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManageThisMeeting ? (
          <div className="pt-2">
            <AddMeetingParticipantForm
              meetingId={meeting.id}
              participants={profileOptions}
            />
          </div>
        ) : null}
      </Panel>

      {orderedSections.map((section) => (
        <MeetingSection
          key={section.section_key}
          title={section.title}
          sectionKey={section.section_key}
          meeting={meeting}
          canManage={canManage}
          departmentOptions={departmentOptions}
          profileOptions={profileOptions}
          meetingOptions={meetingOptions}
          issueOptions={issueOptions}
          headlines={meetingHeadlines}
          issues={meetingIssues}
          actions={meetingActions}
          decisions={meetingDecisions}
          names={names}
        />
      ))}

      {meetingHeadlines.length === 0 && meetingActions.length === 0 && meetingIssues.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No meeting content yet"
          description="Use the sections above to record scorecard and priority notes, add headlines, actions, issues and decisions."
        />
      ) : null}

      <p className="text-sm text-ink-subtle">
        <Link href="/performance/meetings" className="underline-offset-4 hover:underline">
          Back to meetings
        </Link>
      </p>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

function MeetingSection({
  title,
  sectionKey,
  meeting,
  canManage,
  departmentOptions,
  profileOptions,
  meetingOptions,
  issueOptions,
  headlines,
  issues,
  actions,
  decisions,
  names,
}: {
  title: string;
  sectionKey: string;
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>;
  canManage: boolean;
  departmentOptions: readonly SelectOption[];
  profileOptions: readonly SelectOption[];
  meetingOptions: readonly SelectOption[];
  issueOptions: readonly SelectOption[];
  headlines: Awaited<ReturnType<typeof listMeetingHeadlines>>;
  issues: Awaited<ReturnType<typeof listIssues>>;
  actions: Awaited<ReturnType<typeof listActionItems>>;
  decisions: Awaited<ReturnType<typeof listDecisions>>;
  names: Map<string, string>;
}) {
  return (
    <Panel id={`meeting-${sectionKey}`} title={title}>
      {sectionKey === "scorecard" ? (
        <SectionNote value={meeting.scorecard_review} empty="No scorecard review notes yet." />
      ) : null}

      {sectionKey === "priorities" ? (
        <SectionNote value={meeting.priority_review} empty="No priority review notes yet." />
      ) : null}

      {sectionKey === "headlines" ? (
        <div className="space-y-3">
          <HeadlineList headlines={headlines} />
          {canManage ? (
            <HeadlineForm meetingId={meeting.id} departments={departmentOptions} />
          ) : null}
        </div>
      ) : null}

      {sectionKey === "actions" ? (
        <div className="space-y-3">
          <ActionList actions={actions} names={names} />
          {canManage ? (
            <ActionItemForm
              departments={departmentOptions}
              profiles={profileOptions}
              meetings={meetingOptions}
              fixedMeetingId={meeting.id}
            />
          ) : null}
        </div>
      ) : null}

      {sectionKey === "issues" ? (
        <div className="space-y-3">
          <IssueList issues={issues} names={names} />
          {canManage ? (
            <IssueForm
              departments={departmentOptions}
              profiles={profileOptions}
              meetings={meetingOptions}
            />
          ) : null}
        </div>
      ) : null}

      {sectionKey === "decisions" ? (
        <div className="space-y-3">
          <DecisionList decisions={decisions} names={names} />
          {canManage ? (
            <DecisionForm
              departments={departmentOptions}
              meetings={meetingOptions}
              issues={issueOptions}
              fixedMeetingId={meeting.id}
            />
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function SectionNote({ value, empty }: { value: string | null; empty: string }) {
  return <p className="text-sm text-ink-muted">{value ? value : empty}</p>;
}

function HeadlineList({ headlines }: { headlines: Awaited<ReturnType<typeof listMeetingHeadlines>> }) {
  if (headlines.length === 0) return <p className="text-sm text-ink-muted">No headlines yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {headlines.map((headline) => (
        <li key={headline.id} className="space-y-0.5 py-3">
          <p className="font-medium text-ink">{headline.title}</p>
          {headline.type ? <p className="text-xs text-ink-subtle">{headline.type}</p> : null}
          {headline.note ? <p className="text-ink-muted">{headline.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ActionList({
  actions,
  names,
}: {
  actions: Awaited<ReturnType<typeof listActionItems>>;
  names: Map<string, string>;
}) {
  if (actions.length === 0) return <p className="text-sm text-ink-muted">No actions yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {actions.map((action) => (
        <li key={action.id} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="font-medium text-ink">{action.title}</p>
            <p className="text-ink-muted">
              {action.owner_profile_id ? names.get(action.owner_profile_id) ?? "Unassigned" : "Unassigned"}
              {action.due_date ? ` · due ${formatDate(action.due_date)}` : ""}
            </p>
          </div>
          <StatusBadge label={actionStatusLabel(action.status)} tone={actionStatusTone(action.status)} />
        </li>
      ))}
    </ul>
  );
}

function IssueList({
  issues,
  names,
}: {
  issues: Awaited<ReturnType<typeof listIssues>>;
  names: Map<string, string>;
}) {
  if (issues.length === 0) return <p className="text-sm text-ink-muted">No issues raised in this meeting yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {issues.map((issue) => (
        <li key={issue.id} className="space-y-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/performance/issues/${issue.id}`}
              className="font-medium text-ink underline-offset-4 hover:underline"
            >
              {issue.title}
            </Link>
            <StatusBadge label={issueStatusLabel(issue.status)} tone={issueStatusTone(issue.status)} />
            <StatusBadge label={issuePriorityLabel(issue.priority)} tone={issuePriorityTone(issue.priority)} />
          </div>
          {issue.owner_profile_id ? (
            <p className="text-ink-muted">{names.get(issue.owner_profile_id) ?? "Unassigned"}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function DecisionList({
  decisions,
  names,
}: {
  decisions: Awaited<ReturnType<typeof listDecisions>>;
  names: Map<string, string>;
}) {
  if (decisions.length === 0) return <p className="text-sm text-ink-muted">No decisions recorded yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {decisions.map((decision) => (
        <li key={decision.id} className="space-y-0.5 py-3">
          <p className="font-medium text-ink">{decision.title}</p>
          <p className="text-ink-muted">{decision.decision}</p>
          <p className="text-xs text-ink-subtle">
            {decision.decided_by ? names.get(decision.decided_by) ?? "Unknown" : "Unknown"} ·{" "}
            {formatDateTime(decision.decided_at)}
          </p>
        </li>
      ))}
    </ul>
  );
}
