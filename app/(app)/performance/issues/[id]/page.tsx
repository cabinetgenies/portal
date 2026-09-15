import Link from "next/link";
import { notFound } from "next/navigation";

import { IssueNoteForm, ResolveIssueForm } from "@/components/performance/forms";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import {
  actionStatusLabel,
  actionStatusTone,
  issuePriorityLabel,
  issuePriorityTone,
  issueStatusLabel,
  issueStatusTone,
} from "@/lib/performance/model";
import {
  getIssue,
  listActionItems,
  listDecisions,
  listIssueNotes,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate, formatDateTime, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Issue",
};

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const canManage = session.capabilities.includes("manage:performance");
  const { id } = await params;
  const issue = await getIssue(id);

  if (!issue) notFound();

  const [allNotes, allActions, allDecisions] = await Promise.all([
    listIssueNotes(),
    listActionItems(),
    listDecisions(),
  ]);

  const notes = allNotes.filter((note) => note.issue_id === issue.id);
  const actions = allActions.filter(
    (action) => action.source === "issue" && action.source_id === issue.id,
  );
  const decisions = allDecisions.filter((decision) => decision.issue_id === issue.id);
  const names = await profileNamesFor([
    issue.owner_profile_id,
    issue.created_by,
    ...notes.map((note) => note.author_profile_id),
    ...actions.map((action) => action.owner_profile_id),
    ...decisions.map((decision) => decision.decided_by),
  ]);

  return (
    <div className="space-y-6">
      <Panel
        id="issue-summary"
        title={issue.title}
        description={formatText(issue.description, "No description.")}
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <SummaryItem label="Status" value={issueStatusLabel(issue.status)} />
          <SummaryItem label="Priority" value={issuePriorityLabel(issue.priority)} />
          <SummaryItem
            label="Owner"
            value={issue.owner_profile_id ? names.get(issue.owner_profile_id) ?? "Unassigned" : "Unassigned"}
          />
        </dl>
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusBadge label={issueStatusLabel(issue.status)} tone={issueStatusTone(issue.status)} />
          <StatusBadge label={issuePriorityLabel(issue.priority)} tone={issuePriorityTone(issue.priority)} />
        </div>
        {issue.resolved_at ? (
          <p className="pt-2 text-xs text-ink-subtle">Resolved {formatDateTime(issue.resolved_at)}</p>
        ) : null}
      </Panel>

      <Panel
        id="discussion"
        title="Discussion Notes"
        description="Lightweight discussion notes. The final decision is stored separately and clearly."
      >
        {notes.length === 0 ? (
          <p className="text-sm text-ink-muted">No discussion notes yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {notes.map((note) => (
              <li key={note.id} className="space-y-1 py-3">
                <p className="text-ink">{note.body}</p>
                <p className="text-xs text-ink-subtle">
                  {note.author_profile_id ? names.get(note.author_profile_id) ?? "Unknown" : "Unknown"} ·{" "}
                  {formatDateTime(note.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="pt-2">
            <IssueNoteForm issueId={issue.id} />
          </div>
        ) : null}
      </Panel>

      <Panel
        id="decision"
        title="Decision"
        description="The decision text is an institutional record, not buried in a discussion thread."
      >
        {decisions.length === 0 ? (
          <p className="text-sm text-ink-muted">No decision recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {decisions.map((decision) => (
              <li key={decision.id} className="space-y-1 py-3">
                <p className="font-medium text-ink">{decision.title}</p>
                <p className="text-ink-muted">{decision.decision}</p>
                <p className="text-xs text-ink-subtle">
                  {decision.decided_by ? names.get(decision.decided_by) ?? "Unknown" : "Unknown"} ·{" "}
                  {formatDateTime(decision.decided_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canManage && issue.status !== "resolved" && issue.status !== "closed" ? (
          <div className="pt-2">
            <ResolveIssueForm issueId={issue.id} />
          </div>
        ) : null}
      </Panel>

      <Panel
        id="related-actions"
        title="Related action items"
        description="Actions that were created from this issue."
      >
        {actions.length === 0 ? (
          <p className="text-sm text-ink-muted">No actions are linked to this issue yet.</p>
        ) : (
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
        )}
      </Panel>

      <p className="text-sm text-ink-subtle">
        <Link href="/performance/issues" className="underline-offset-4 hover:underline">
          Back to issues &amp; actions
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

