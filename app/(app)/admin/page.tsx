import Link from "next/link";

import { ArrowRightIcon, UsersIcon } from "@/components/icons";
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions/roles";

export const metadata = {
  title: "Administration",
};

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/users"
          className="group flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="space-y-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted">
              <UsersIcon className="h-4 w-4" />
            </span>
            <span className="block pt-3 text-sm font-medium text-ink">
              Users &amp; roles
            </span>
            <span className="block text-sm leading-6 text-ink-muted">
              Your profile today; the full user directory, role assignment and
              reporting lines in the next phase.
            </span>
          </span>
          <ArrowRightIcon className="h-4 w-4 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
        </Link>

        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted">
            <ArrowRightIcon className="h-4 w-4" />
          </span>
          <p className="pt-3 text-sm font-medium text-ink">Portal configuration</p>
          <p className="text-sm leading-6 text-ink-muted">
            Company settings, module toggles and integration credentials. Coming in a
            later phase.
          </p>
        </div>
      </div>

      <section
        aria-labelledby="role-model-heading"
        className="space-y-4 rounded-xl border border-line bg-surface p-5"
      >
        <div className="space-y-1">
          <h2
            id="role-model-heading"
            className="text-sm font-semibold tracking-tight text-ink"
          >
            Role model
          </h2>
          <p className="text-sm text-ink-muted">
            Roles are stored on each profile and enforced in the database by Row Level
            Security, not in the browser.
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((role) => (
            <div key={role} className="rounded-lg border border-line bg-surface-muted p-4">
              <dt className="text-sm font-medium text-ink">{ROLE_LABELS[role]}</dt>
              <dd className="text-xs leading-5 text-ink-muted">
                {ROLE_DESCRIPTIONS[role]}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
