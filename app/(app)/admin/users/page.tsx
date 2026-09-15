import {
  CreatePortalUserForm,
  LinkExistingPortalUserForm,
} from "@/components/admin/user-forms";
import { UserDirectoryTable } from "@/components/admin/user-directory-table";
import { EmptyState } from "@/components/empty-state/empty-state";
import { InfoIcon, UsersIcon } from "@/components/icons";
import { MetricCard } from "@/components/metric-card/metric-card";
import { Panel } from "@/components/ui/panel";
import { listRecentUserAuditEvents, listUserDirectory } from "@/lib/admin/user-queries";
import { requireCapability } from "@/lib/auth/dal";
import { getServiceRoleKey } from "@/lib/env";
import { loadExperienceCatalog } from "@/lib/experience/queries";
import { formatDateTime } from "@/lib/utils/format";

export const metadata = {
  title: "Users",
};

export default async function AdminUsersPage() {
  // Re-checked here as well as in the admin layout: authorization belongs as
  // close to the data as possible, not only in a wrapping layout.
  const session = await requireCapability("administer:portal");

  if (!session.isAllowed) {
    // The admin layout renders the restricted state, so this is only a safety net
    // for the (unreachable) case of the page rendering outside that layout.
    return null;
  }

  const [directory, activity] = await Promise.all([
    listUserDirectory(),
    listRecentUserAuditEvents(12),
  ]);
  const catalog = await loadExperienceCatalog();

  // Assignment options come from the registry, and only when the registry is the
  // real one: the fallback catalog has no rows to write to, so the controls stay
  // disabled rather than accepting an id that cannot be saved.
  const editable = catalog.source === "database";
  const departments = editable
    ? catalog.departments
        .filter((department) => department.active)
        .map((department) => ({ id: department.id, name: department.name }))
    : [];
  const businessRoles = editable
    ? catalog.businessRoles
        .filter((role) => role.active)
        .map((role) => ({ id: role.id, name: role.name }))
    : [];

  // The service role key is server-only: the browser is told whether account
  // creation is available, never the credential itself.
  const canProvisionAccounts = getServiceRoleKey() !== null;
  const managers = directory
    .filter((user) => user.active)
    .map((user) => ({ id: user.profileId, name: user.name }));

  const activeCount = directory.filter((user) => user.active).length;
  const eligibleCount = directory.filter((user) => user.compensationEligible).length;
  const plannedCount = directory.filter((user) => user.planName !== null).length;
  const onDrawCount = directory.filter((user) => user.onDraw).length;

  return (
    <div className="space-y-6">
      <section
        aria-label="Directory summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <MetricCard
          label="Portal users"
          value={`${activeCount} active`}
          hint={`${directory.length} profile${directory.length === 1 ? "" : "s"} in total`}
          placeholder={false}
        />
        <MetricCard
          label="Compensation eligible"
          value={`${eligibleCount}`}
          hint="Marked eligible for compensation"
          placeholder={false}
        />
        <MetricCard
          label="On a plan today"
          value={`${plannedCount}`}
          hint="Have a compensation plan in force"
          placeholder={false}
        />
        <MetricCard
          label="On draw"
          value={`${onDrawCount}`}
          hint="Enrolled in draw against commission"
          placeholder={false}
        />
      </section>

      <Panel
        id="create-portal-user"
        title="Create a portal account"
        description="Accounts are created through the Supabase Auth Admin API from this server action. auth.users rows are never written with SQL, and the service role key stays on the server."
      >
        <CreatePortalUserForm
          managers={managers}
          departments={departments}
          businessRoles={businessRoles}
          canProvision={canProvisionAccounts}
        />
      </Panel>

      <Panel
        id="link-portal-user"
        title="Link an existing Supabase Auth user"
        description="For accounts that already exist in Supabase Auth. Creating the account in Supabase first is always a valid route — the sign-up trigger creates the portal profile — and this form covers the case where a profile row is missing."
      >
        <LinkExistingPortalUserForm
          managers={managers}
          departments={departments}
          businessRoles={businessRoles}
        />
      </Panel>

      <Panel
        id="user-directory"
        title="User directory"
        description="Every portal profile with its role, reporting line, status and commission setup. Changes are recorded in the audit trail below."
      >
        {directory.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="h-5 w-5" />}
            title="No portal users yet."
            description="Invite someone above, or create the account in Supabase → Authentication → Users and it will appear here."
          />
        ) : (
          <UserDirectoryTable
            users={directory}
            managers={managers}
            departments={departments}
            businessRoles={businessRoles}
            currentUserId={session.userId}
          />
        )}
      </Panel>

      <Panel
        id="user-activity"
        title="Recent user activity"
        description="Append-only audit rows written by database triggers. Portal changes are attributed to the signed-in administrator; account creation through Supabase Auth is attributed to Supabase Auth."
      >
        {activity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
            No user or commission-setup activity recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-3"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-ink">
                    {entry.actionLabel}
                    {entry.subject ? (
                      <span className="font-normal text-ink-muted"> · {entry.subject}</span>
                    ) : null}
                  </p>
                  <p className="text-xs leading-5 text-ink-subtle">
                    {entry.entityLabel}
                    {entry.summary ? ` · ${entry.summary}` : ""}
                  </p>
                </div>
                <p className="text-xs whitespace-nowrap text-ink-subtle">
                  {entry.actor} · {formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-start gap-2 text-xs leading-5 text-ink-subtle">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Commission setup is logged too: eligibility changes, plan assignments and draw
            periods each write their own audit row.
          </span>
        </p>
      </Panel>
    </div>
  );
}
