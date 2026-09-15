import { cache } from "react";
import { redirect } from "next/navigation";

import {
  resolvePortalAccess,
  type AccessDenialReason,
  type PortalAccess,
  type ProfileLookup,
} from "@/lib/auth/access";
import { ACCESS_DENIED_ROUTE, DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE } from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import {
  capabilitiesFor,
  normalizeRole,
  type Capability,
  type Role,
} from "@/lib/permissions/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";

export { ACCESS_DENIED_ROUTE, DEFAULT_AUTHENTICATED_ROUTE, LOGIN_ROUTE };

/**
 * Data access layer for authentication and authorization.
 *
 * Every server-rendered page, layout and Server Action goes through here, so a
 * route can never read portal data without a verified session. `cache` from
 * React de-duplicates the Supabase calls within a single render pass.
 */

export const getAuthenticatedUser = cache(async () => {
  if (!isSupabaseConfigured) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
});

export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const lookup = await getProfileLookup();

  return lookup.status === "found" ? lookup.profile : null;
});

/**
 * The signed-in person's profile row, distinguishing "no row" from "cannot
 * read the table". Access is decided from the result by
 * `resolvePortalAccess`, so a failed read denies access rather than granting it.
 */
export const getProfileLookup = cache(async (): Promise<ProfileLookup> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return { status: "missing" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Most commonly: the profiles migration has not been applied yet.
    console.error("Failed to load the signed-in profile:", error.message);
    return { status: "unavailable", message: error.message };
  }

  return data ? { status: "found", profile: data } : { status: "missing" };
});

/** A session that may use the portal: an active, approved profile. */
export type AuthorizedSession = {
  status: "authorized";
  userId: string;
  email: string | null;
  /** The active profile that authorizes this session. Always present. */
  profile: ProfileRow;
  role: Role;
  capabilities: readonly Capability[];
};

/**
 * A session that may not: the person authenticated, but no active profile
 * authorizes them. `reason` is what the denial page explains.
 */
export type DeniedSession = {
  status: "denied";
  userId: string;
  email: string | null;
  /** The profile row when one exists — an inactive one still names the person. */
  profile: ProfileRow | null;
  reason: AccessDenialReason;
  /**
   * Always empty. A denied session holds no capability, so code that reads the
   * list instead of the status still finds nothing to authorize — the same
   * fail-closed shape `normalizeRole` uses for an unknown role.
   */
  capabilities: readonly Capability[];
};

export type SessionContext = AuthorizedSession | DeniedSession;

export function isAuthorizedSession(
  session: SessionContext | null,
): session is AuthorizedSession {
  return session?.status === "authorized";
}

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  const lookup = await getProfileLookup();
  const access: PortalAccess = resolvePortalAccess(lookup);
  const profile = lookup.status === "found" ? lookup.profile : null;
  const userId = user.id;
  const email = user.email ?? profile?.email ?? null;

  // A denied session carries no capabilities at all. The role is reported as
  // stored — an administrator needs to see that an existing employee is
  // deactivated, not demoted — but nothing may be authorized from it.
  if (access.status !== "authorized") {
    return {
      status: "denied",
      userId,
      email,
      profile,
      reason: access.reason,
      capabilities: [],
    };
  }

  const role = normalizeRole(access.profile.role);

  return {
    status: "authorized",
    userId,
    email,
    profile: access.profile,
    role,
    capabilities: capabilitiesFor(role),
  };
});

/**
 * The gate for every protected route: an authorized session, or a redirect.
 *
 * No session goes to /login. An authenticated person whose profile is missing or
 * inactive goes to /access-denied — signing in successfully is not the same as
 * being allowed in, and no protected route is ever rendered for them.
 */
export async function requireSession(): Promise<AuthorizedSession> {
  const session = await getSessionContext();

  if (!session) {
    redirect(LOGIN_ROUTE);
  }

  if (session.status === "denied") {
    redirect(ACCESS_DENIED_ROUTE);
  }

  return session;
}

/**
 * Authorization check for capability-specific areas. Returns the session plus
 * whether the capability is held, so a page can render an explicit "restricted"
 * state rather than hiding the reason behind a silent redirect.
 */
export async function requireCapability(capability: Capability) {
  const session = await requireSession();

  return {
    ...session,
    isAllowed: session.capabilities.includes(capability),
  };
}
