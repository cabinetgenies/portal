import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * Where a signed-in person stands with the portal.
 *
 * Authenticating is not authorizing. Supabase Auth proves who somebody is —
 * with a password or with Google — and that is all it proves. The portal's own
 * record of them is `public.profiles`, and access is granted only by a profile
 * that exists and is active:
 *
 *   authenticated Supabase user → profile resolved → active? → yes: continue
 *                                                            → no: clean denial
 *
 * Google sign-in in particular must never be treated as approval: any Google
 * account can complete the OAuth round trip, and only an administrator deciding
 * that a person belongs on the portal may activate their profile.
 */

/** Why an authenticated person is not being let into the portal. */
export type AccessDenialReason =
  | "no-profile"
  | "inactive-profile"
  | "directory-unavailable";

export type PortalAccess =
  | { status: "authorized"; profile: ProfileRow }
  | { status: "denied"; reason: AccessDenialReason };

/**
 * The result of looking up the signed-in person's profile.
 *
 * `unavailable` is separate from `missing` on purpose: a deployment whose
 * migrations have not been applied cannot read the table at all, and that is an
 * administrator's problem to fix, not a person's access decision to appeal.
 */
export type ProfileLookup =
  | { status: "found"; profile: ProfileRow }
  | { status: "missing" }
  | { status: "unavailable"; message: string };

export function resolvePortalAccess(lookup: ProfileLookup): PortalAccess {
  if (lookup.status === "unavailable") {
    return { status: "denied", reason: "directory-unavailable" };
  }

  if (lookup.status === "missing") {
    return { status: "denied", reason: "no-profile" };
  }

  if (!lookup.profile.active) {
    return { status: "denied", reason: "inactive-profile" };
  }

  return { status: "authorized", profile: lookup.profile };
}

export type AccessDenialCopy = {
  title: string;
  description: string;
  guidance: string;
};

/**
 * What the denial page tells the person, and nothing more.
 *
 * The page explains their own situation and what to do next. It deliberately
 * says nothing about the portal's data, the directory, or why anyone else may
 * or may not have access.
 */
export const ACCESS_DENIAL_COPY: Record<AccessDenialReason, AccessDenialCopy> = {
  "no-profile": {
    title: "Your account is signed in, but it is not linked to Cabinet Genies",
    description:
      "You were authenticated successfully, but there is no Cabinet Genies profile to open for this account yet.",
    guidance:
      "Ask an administrator to create your portal profile, then sign in again with the same account.",
  },
  "inactive-profile": {
    title: "You do not currently have access to Cabinet Genies",
    description:
      "You signed in successfully, but portal access has not been granted for this account. Signing in with Google — or with a password — proves who you are; it does not by itself grant access.",
    guidance:
      "If an administrator has not yet approved your profile, this is expected — ask them to activate it, and sign in again once they have.",
  },
  "directory-unavailable": {
    title: "Your profile could not be checked",
    description:
      "The portal could not read its profile directory, so access could not be confirmed. This usually means the portal's database migrations have not been applied to this environment yet.",
    guidance:
      "Sign out and ask an administrator to apply the migrations in supabase/migrations, then try again.",
  },
};

export function accessDenialCopy(reason: AccessDenialReason): AccessDenialCopy {
  return ACCESS_DENIAL_COPY[reason];
}
