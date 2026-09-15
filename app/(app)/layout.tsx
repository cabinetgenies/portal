import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { ConfigurationNotice } from "@/components/configuration-notice/configuration-notice";
import { requireSession } from "@/lib/auth/dal";
import { displayNameFor, initialsFor } from "@/lib/auth/identity";
import { navigationForCapabilities } from "@/lib/permissions/navigation";
import { ROLE_LABELS } from "@/lib/permissions/roles";

/**
 * Every route below this layout is session-dependent, so it must never be
 * prerendered. This is explicit rather than inferred from `cookies()` so a
 * deployment that is missing its Supabase configuration still serves these
 * routes per request instead of caching a redirect for everyone.
 */
export const dynamic = "force-dynamic";

/**
 * Authenticated area. This layout is the gate for every protected route: it
 * verifies the session through the data access layer before rendering the shell.
 *
 * Note that a layout cannot protect the data inside nested routes by itself —
 * nested pages and Server Actions re-check through `lib/auth/dal.ts`. This layout
 * exists so the shell is never rendered for an unauthenticated request.
 */
export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  const name = displayNameFor(session.profile, session.email);

  return (
    <AppShell
      sections={navigationForCapabilities(session.capabilities)}
      user={{
        name,
        email: session.email,
        roleLabel: ROLE_LABELS[session.role],
        initials: initialsFor(name),
      }}
    >
      {session.profile ? null : (
        <div className="mb-6">
          <ConfigurationNotice
            title="Your profile record is missing"
            description="This account has no row in public.profiles, so no role could be resolved. Apply supabase/migrations/20260915090000_create_profiles.sql and the missing profile will be created by the auth trigger."
          />
        </div>
      )}
      {children}
    </AppShell>
  );
}
