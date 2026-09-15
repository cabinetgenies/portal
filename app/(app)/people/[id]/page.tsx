import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { displayNameFor } from "@/lib/auth/identity";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import { listKnowledgeItems } from "@/lib/knowledge/queries";
import {
  actionStatusLabel,
  actionStatusTone,
  priorityStatusLabel,
  priorityStatusTone,
  reviewStatusLabel,
  reviewStatusTone,
} from "@/lib/performance/model";
import {
  listActionItems,
  listMeasurables,
  listPriorities,
  listReviews,
  profileNamesFor,
} from "@/lib/performance/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Person",
};

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !profile) notFound();

  const [catalog, measurables, priorities, reviews, actions] = await Promise.all([
    loadExperienceCatalog(),
    listMeasurables(),
    listPriorities(),
    listReviews(),
    listActionItems(),
  ]);

  const role = catalog.businessRoles.find((candidate) => candidate.id === profile.business_role_id);
  const department = catalog.departments.find(
    (candidate) => candidate.id === profile.department_id,
  );
  const roleExpectations = await listKnowledgeItems({
    roleIds: profile.business_role_id ? [profile.business_role_id] : [],
    types: ["role_expectation"],
    statuses: ["published"],
  });

  const employeeMeasurables = measurables.filter(
    (measurable) =>
      measurable.scope === "employee" &&
      (measurable.employee_id === profile.id || measurable.owner_profile_id === profile.id),
  );
  const employeePriorities = priorities.filter(
    (priority) => priority.owner_profile_id === profile.id,
  );
  const employeeReviews = reviews.filter((review) => review.employee_id === profile.id);
  const openDevelopmentActions = actions.filter(
    (action) => action.owner_profile_id === profile.id && action.status === "open",
  );

  const names = await profileNamesFor([
    profile.manager_id,
    ...employeeReviews.map((review) => review.manager_id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title={displayNameFor(profile, profile.email)}
        description="Role, manager, role expectations, scorecard measurables, quarterly priorities, recent reviews and open development actions."
      />

      <Panel id="person-role" title="Role & reporting">
        <dl className="grid gap-4 sm:grid-cols-3">
          <PersonItem label="Role" value={role?.name ?? "Unassigned"} />
          <PersonItem label="Department" value={department?.name ?? formatText(profile.department)} />
          <PersonItem
            label="Manager"
            value={profile.manager_id ? names.get(profile.manager_id) ?? "Unknown" : "No manager"}
          />
        </dl>
      </Panel>

      <Panel
        id="role-expectations"
        title="Role expectations"
        description="Sourced from the existing Knowledge/BOS role-expectation items; nothing is duplicated here."
      >
        {roleExpectations.length === 0 ? (
          <p className="text-sm text-ink-muted">No published role expectations for this role yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {roleExpectations.map((item) => (
              <li key={item.id} className="space-y-0.5 py-3">
                <p className="font-medium text-ink">{item.title}</p>
                {item.description ? <p className="text-ink-muted">{item.description}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="measurables"
        title="Scorecard measurables"
        description="Employee-scope measurables assigned to this person."
      >
        {employeeMeasurables.length === 0 ? (
          <p className="text-sm text-ink-muted">No employee measurables yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {employeeMeasurables.map((measurable) => (
              <li key={measurable.id} className="flex items-center justify-between gap-3 py-3">
                <span className="font-medium text-ink">{measurable.name}</span>
                <span className="text-ink-muted">
                  {measurable.target ?? "—"}
                  {measurable.unit ? ` ${measurable.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="priorities"
        title="Current quarterly priorities"
        description="The priorities owned by this person."
      >
        {employeePriorities.length === 0 ? (
          <p className="text-sm text-ink-muted">No individual priorities yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {employeePriorities.map((priority) => (
              <li key={priority.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{priority.title}</p>
                  <p className="text-ink-muted">{formatDate(priority.due_date)}</p>
                </div>
                <StatusBadge
                  label={priorityStatusLabel(priority.status)}
                  tone={priorityStatusTone(priority.status)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="reviews"
        title="Recent reviews"
        description="Employee performance reviews, with no numeric scoring introduced."
      >
        {employeeReviews.length === 0 ? (
          <p className="text-sm text-ink-muted">No reviews yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {employeeReviews.map((review) => (
              <li key={review.id} className="space-y-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-ink">
                    {formatDate(review.period_start)} – {formatDate(review.period_end)}
                  </p>
                  <StatusBadge
                    label={reviewStatusLabel(review.status)}
                    tone={reviewStatusTone(review.status)}
                  />
                </div>
                <p className="text-ink-muted">{formatText(review.overall_summary, "No summary yet")}</p>
                <p className="text-xs text-ink-subtle">
                  Manager: {review.manager_id ? names.get(review.manager_id) ?? "Unknown" : "No manager"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        id="development-actions"
        title="Open development actions"
        description="Open action items owned by this person."
      >
        {openDevelopmentActions.length === 0 ? (
          <p className="text-sm text-ink-muted">No open actions.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {openDevelopmentActions.map((action) => (
              <li key={action.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{action.title}</p>
                  <p className="text-ink-muted">{formatDate(action.due_date)}</p>
                </div>
                <StatusBadge
                  label={actionStatusLabel(action.status)}
                  tone={actionStatusTone(action.status)}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-sm text-ink-subtle">
        <Link href="/people" className="underline-offset-4 hover:underline">
          Back to People
        </Link>
      </p>

      {employeeMeasurables.length === 0 &&
      employeePriorities.length === 0 &&
      employeeReviews.length === 0 ? (
        <EmptyState
          icon={<PerformanceIcon className="h-5 w-5" />}
          title="No performance data for this person yet"
          description="Their role and reporting line are shown. Performance records will appear here as they are added."
        />
      ) : null}
    </div>
  );
}

function PersonItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">{label}</dt>
      <dd className="text-sm text-ink">{value}</dd>
    </div>
  );
}

