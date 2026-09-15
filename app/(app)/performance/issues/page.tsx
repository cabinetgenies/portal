import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import {
  ActionItemForm,
  CompleteActionForm,
  IssueForm,
  type SelectOption,
} from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import {
  actionSourceLabel,
  actionStatusLabel,
  actionStatusTone,
  issuePriorityLabel,
  issuePriorityTone,
  issueStatusLabel,
  issueStatusTone,
  isOverdue,
} from "@/lib/performance/model";
import {
  listActionItems,
  listIssues,
  listMeetings,
  listVisibleProfileOptions,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Issues & Actions",
};

export default async function IssuesAndActionsPage() {
  const session = await requireSession();
  const canManage = session.capabilities.includes("manage:performance");

  const [issues, actions, meetings, catalog, profiles] = await Promise.all([
    listIssues(),
    listActionItems(),
    listMeetings(),
    loadExperienceCatalog(),
    canManage ? listVisibleProfileOptions() : Promise.resolve([]),
  ]);

  const departmentOptions: SelectOption[] = catalog.departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const profileOptions: SelectOption[] = profiles.map((profile) => ({
    value: profile.id,
    label: profile.name,
  }));
  const meetingOptions: SelectOption[] = meetings.map((meeting) => ({
    value: meeting.id,
    label: `${meeting.meeting_type === "leadership" ? "Leadership" : "Department"} · ${formatDate(meeting.meeting_date)}`,
  }));

  const names = await profileNamesFor([
    ...issues.map((issue) => issue.owner_profile_id),
    ...actions.map((action) => action.owner_profile_id),
  ]);

  return (
    <div className="space-y-6">
      {issues.length === 0 && actions.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No issues or action items yet"
          description="Issues become decisions and action items. Actions created during meetings are the same shared action items shown here."
        />
      ) : null}

      <Panel
        id="issues"
        title="Issues"
        description="Open, discussing, resolved and closed issues. A resolved issue stores its decision text in the decision record."
      >
        {issues.length === 0 ? (
          <p className="text-sm text-ink-muted">No issues yet.</p>
        ) : (
          <TableWrap>
            <Table caption="Issues">
              <thead>
                <tr>
                  <Th>Issue</Th>
                  <Th>Priority</Th>
                  <Th>Owner</Th>
                  <Th>Status</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <Td>
                      <Link
                        href={`/performance/issues/${issue.id}`}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {issue.title}
                      </Link>
                      {issue.description ? (
                        <span className="block text-xs text-ink-subtle">
                          {formatText(issue.description)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <StatusBadge
                        label={issuePriorityLabel(issue.priority)}
                        tone={issuePriorityTone(issue.priority)}
                      />
                    </Td>
                    <Td>
                      {issue.owner_profile_id
                        ? names.get(issue.owner_profile_id) ?? "Unassigned"
                        : "Unassigned"}
                    </Td>
                    <Td>
                      <StatusBadge
                        label={issueStatusLabel(issue.status)}
                        tone={issueStatusTone(issue.status)}
                      />
                    </Td>
                    <Td>{issue.source}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <Panel
        id="actions"
        title="Action Items"
        description="Shared action items. Overdue items stay visible until they are completed or cancelled."
      >
        {actions.length === 0 ? (
          <p className="text-sm text-ink-muted">No action items yet.</p>
        ) : (
          <TableWrap>
            <Table caption="Action items">
              <thead>
                <tr>
                  <Th>Action</Th>
                  <Th>Owner</Th>
                  <Th>Source</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th>Complete</Th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => {
                  const overdue = isOverdue({
                    dueDate: action.due_date,
                    completedAt: action.completed_at,
                  });
                  return (
                    <tr key={action.id}>
                      <Td>
                        <span className="font-medium text-ink">{action.title}</span>
                        {overdue ? (
                          <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                            Overdue
                          </span>
                        ) : null}
                      </Td>
                      <Td>
                        {action.owner_profile_id
                          ? names.get(action.owner_profile_id) ?? "Unassigned"
                          : "Unassigned"}
                      </Td>
                      <Td>{actionSourceLabel(action.source)}</Td>
                      <Td>{formatDate(action.due_date)}</Td>
                      <Td>
                        <StatusBadge
                          label={actionStatusLabel(action.status)}
                          tone={actionStatusTone(action.status)}
                        />
                      </Td>
                      <Td>
                        {action.status === "open" ? (
                          <CompleteActionForm actionId={action.id} />
                        ) : (
                          formatDate(action.completed_at)
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      {canManage ? (
        <>
          <Panel
            id="raise-issue"
            title="Raise an issue"
            description="Issues can come from a meeting, scorecard, quarterly priority, review, or be raised manually."
          >
            <IssueForm
              departments={departmentOptions}
              profiles={profileOptions}
              meetings={meetingOptions}
            />
          </Panel>

          <Panel
            id="add-action"
            title="Add an action item"
            description="Action items are work someone needs to complete. They are separate from requests, which need submission or approval."
          >
            <ActionItemForm
              departments={departmentOptions}
              profiles={profileOptions}
              meetings={meetingOptions}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}

