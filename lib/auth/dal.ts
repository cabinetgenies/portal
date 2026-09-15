import { cache } from "react";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import {
  capabilitiesFor,
  normalizeRole,
  type Capability,
  type Role,
} from "@/lib/permissions/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/database.types";

export const LOGIN_ROUTE = "/login";
export const DEFAULT_AUTHENTICATED_ROUTE = "/home";

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
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
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
    return null;
  }

  return data;
});

export type SessionContext = {
  userId: string;
  email: string | null;
  profile: ProfileRow | null;
  role: Role;
  capabilities: readonly Capability[];
};

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getAuthenticatedUser();

  if (!user) {
    return null;
  }

  const profile = await getCurrentProfile();
  const role = normalizeRole(profile?.role);

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? null,
    profile,
    role,
    capabilities: capabilitiesFor(role),
  };
});

/** Redirects to /login when there is no verified session. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();

  if (!session) {
    redirect(LOGIN_ROUTE);
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
