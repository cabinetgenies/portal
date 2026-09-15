import { EmptyState } from "@/components/empty-state/empty-state";
import { InfoIcon, UsersIcon } from "@/components/icons";
import { requireCapability } from "@/lib/auth/dal";
import { displayNameFor } from "@/lib/auth/identity";
import { roleLabel } from "@/lib/permissions/roles";

export const metadata = {
  title: "Users",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function formatValue(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : "—";
}

export default async function AdminUsersPage() {
  // Re-checked here as well as in the admin layout: authorization belongs as
  // close to the data as possible, not only in a wrapping layout.
  const session = await requireCapability("administer:portal");

  if (!session.isAllowed) {
    // The admin layout renders the restricted state, so this is only a safety net
    // for the (unreachable) case of the page rendering outside that layout.
    return null;
  }

  const { profile } = session;
  const name = displayNameFor(profile, session.email);

  const details = [
    { label: "Name", value: name },
    { label: "Email", value: formatValue(profile?.email ?? session.email) },
    { label: "Role", value: roleLabel(session.role) },
    { label: "Department", value: formatValue(profile?.department) },
    { label: "Manager", value: formatValue(profile?.manager_id) },
    { label: "Status", value: profile?.active === false ? "Inactive" : "Active" },
    { label: "Profile created", value: formatDate(profile?.created_at) },
    { label: "Last updated", value: formatDate(profile?.updated_at) },
  ];

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="current-user-heading"
        className="space-y-4 rounded-xl border border-line bg-surface p-5"
      >
        <div className="space-y-1">
          <h2
            id="current-user-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            Your profile
          </h2>
          <p className="text-sm text-ink-muted">
            The record the portal uses for your identity, role and reporting line.
          </p>
        </div>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          {details.map((detail) => (
            <div key={detail.label} className="space-y-1">
              <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
                {detail.label}
              </dt>
              <dd className="text-sm break-words text-ink">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="directory-heading" className="space-y-4">
        <div className="space-y-1">
          <h2
            id="directory-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            User directory
          </h2>
          <p className="text-sm text-ink-muted">
            The full user table with role assignment and manager changes will live
            here.
          </p>
        </div>
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="The user directory is being built."
          description="Rows for every portal user, with role and status controls, arrive with the administration phase. The table component is deliberately not stubbed with sample people."
        />
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
          <InfoIcon className="mt-0.5 h-4 w-4 text-ink-subtle" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">Accounts are created in Supabase</p>
            <p className="text-sm leading-6 text-ink-muted">
              Portal users are created in Supabase Authentication — never from the
              browser with privileged credentials. Row Level Security already allows
              administrators to read every profile, so this page can switch to a live
              query without a schema change.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
