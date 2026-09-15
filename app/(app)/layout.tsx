import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { requireSession } from "@/lib/auth/dal";
import { displayNameFor, initialsFor } from "@/lib/auth/identity";
import { getSessionExperience } from "@/lib/experience/queries";
import { navigationForExperience } from "@/lib/permissions/navigation";
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
 * "Verified" now means the profile exists and is active — an authenticated
 * account without an approved profile is redirected to /access-denied here, so
 * the shell is never rendered for it.
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

  // Navigation comes from the resolved role experience: configuration plus the
  // signed-in person's capabilities. Hiding a module here is never a permission —
  // every route re-checks server-side and Postgres enforces RLS.
  const state = await getSessionExperience();
  const experience = state?.experience ?? null;

  return (
    <AppShell
      sections={experience ? navigationForExperience(experience) : []}
      user={{
        name,
        email: session.email,
        // The business role is what the app experience reflects; the security
        // role stays visible under Admin → Users.
        roleLabel: experience?.roleName ?? ROLE_LABELS[session.role],
        departmentName: experience?.departmentName ?? null,
        initials: initialsFor(name),
      }}
    >
      {children}
    </AppShell>
  );
}
