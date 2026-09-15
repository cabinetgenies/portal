import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { MetricCard } from "@/components/metric-card/metric-card";
import { Panel } from "@/components/ui/panel";
import { isOverdue } from "@/lib/performance/model";
import {
  listActionItems,
  listMeetings,
  listPriorities,
  listReviews,
  profileNamesFor,
} from "@/lib/performance/queries";
import { formatDate } from "@/lib/utils/format";

export const metadata = {
  title: "Performance Overview",
};

export default async function PerformanceOverviewPage() {
  const [meetings, priorities, actions, reviews] = await Promise.all([
    listMeetings(),
    listPriorities(),
    listActionItems(),
    listReviews(),
  ]);

  const today = new Date();
  const todayIso = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  )
    .toISOString()
    .slice(0, 10);

  const offTrackPriorities = priorities.filter((priority) =>
    ["at_risk", "off_track"].includes(priority.status),
  ).length;
  const openIssues = actions.filter((action) => action.status === "open").length;
  const overdueActions = actions.filter((action) =>
    isOverdue({
      dueDate: action.due_date,
      completedAt: action.completed_at,
      now: today,
    }),
  ).length;
  const reviewsDueSoon = reviews.filter((review) => {
    if (review.status === "complete" || !review.scheduled_date) return false;
    const scheduled = new Date(`${review.scheduled_date}T00:00:00Z`);
    const soon = new Date(todayIso);
    soon.setUTCDate(soon.getUTCDate() + 30);
    return scheduled.getTime() <= soon.getTime();
  }).length;

  const upcomingMeetings = meetings
    .filter((meeting) => meeting.meeting_date >= todayIso && meeting.status === "scheduled")
    .slice(0, 5);
  const overdueActionItems = actions
    .filter((action) =>
      isOverdue({
        dueDate: action.due_date,
        completedAt: action.completed_at,
        now: today,
      }),
    )
    .slice(0, 5);
  const attentionPriorities = priorities
    .filter((priority) => ["at_risk", "off_track"].includes(priority.status))
    .slice(0, 5);
  const dueReviews = reviews
    .filter((review) => {
      if (review.status === "complete" || !review.scheduled_date) return false;
      const scheduled = new Date(`${review.scheduled_date}T00:00:00Z`);
      const soon = new Date(todayIso);
      soon.setUTCDate(soon.getUTCDate() + 30);
      return scheduled.getTime() <= soon.getTime();
    })
    .slice(0, 5);

  const actionNames = await profileNamesFor(actions.map((action) => action.owner_profile_id));
  const priorityNames = await profileNamesFor(
    priorities.map((priority) => priority.owner_profile_id),
  );
  const reviewNames = await profileNamesFor([
    ...reviews.map((review) => review.employee_id),
    ...reviews.map((review) => review.manager_id),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Scorecards Off Track" value="—" hint="No scorecard data yet" />
        <MetricCard
          label="Priorities Off Track"
          value={String(offTrackPriorities)}
          hint="At risk or off track"
          placeholder={false}
        />
        <MetricCard
          label="Open Issues"
          value={String(openIssues)}
          hint="Open actions that still need attention"
          placeholder={false}
        />
        <MetricCard
          label="Overdue Actions"
          value={String(overdueActions)}
          hint="Past due and not complete"
          placeholder={false}
        />
        <MetricCard
          label="Reviews Due"
          value={String(reviewsDueSoon)}
          hint="Scheduled in the next 30 days"
          placeholder={false}
        />
      </div>

      <Panel
        id="upcoming-meetings"
        title="Upcoming leadership meetings"
        description="Scheduled meetings that have not been completed."
      >
        <EmptyList
          empty="No upcoming meetings."
          rows={upcomingMeetings.map((meeting) => ({
            id: meeting.id,
            primary: `${meeting.meeting_type === "leadership" ? "Leadership" : "Department"} meeting`,
            secondary: formatDate(meeting.meeting_date),
          }))}
        />
      </Panel>

      <Panel
        id="overdue-actions"
        title="Overdue action items"
        description="Open actions past their due date, newest first."
      >
        <EmptyList
          empty="No overdue action items."
          rows={overdueActionItems.map((action) => ({
            id: action.id,
            primary: action.title,
            secondary: action.owner_profile_id
              ? actionNames.get(action.owner_profile_id) ?? "Unassigned"
              : "Unassigned",
            meta: formatDate(action.due_date),
          }))}
        />
      </Panel>

      <Panel
        id="attention-priorities"
        title="Priorities needing attention"
        description="Quarterly priorities that are at risk or off track."
      >
        <EmptyList
          empty="No priorities need attention."
          rows={attentionPriorities.map((priority) => ({
            id: priority.id,
            primary: priority.title,
            secondary: priority.owner_profile_id
              ? priorityNames.get(priority.owner_profile_id) ?? "Unassigned"
              : "Unassigned",
          }))}
        />
      </Panel>

      <Panel
        id="reviews-due"
        title="Reviews due soon"
        description="Employee reviews scheduled within the next 30 days."
      >
        <EmptyList
          empty="No reviews due soon."
          rows={dueReviews.map((review) => ({
            id: review.id,
            primary: reviewNames.get(review.employee_id) ?? "Employee",
            secondary: formatDate(review.scheduled_date),
            meta: review.manager_id
              ? reviewNames.get(review.manager_id) ?? "Manager"
              : "Manager",
          }))}
        />
      </Panel>

      {meetings.length === 0 && actions.length === 0 && priorities.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No performance data yet"
          description="The module is ready, but no scorecards, priorities, meetings, issues, actions or reviews have been added yet. Nothing here is simulated."
        />
      ) : null}
    </div>
  );
}

function EmptyList({
  rows,
  empty,
}: {
  rows: readonly {
    id: string;
    primary: string;
    secondary: string;
    meta?: string;
  }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between">
          <div>
            <p className="font-medium text-ink">{row.primary}</p>
            <p className="text-ink-muted">{row.secondary}</p>
          </div>
          {row.meta ? <p className="text-ink-subtle">{row.meta}</p> : null}
        </li>
      ))}
    </ul>
  );
}

