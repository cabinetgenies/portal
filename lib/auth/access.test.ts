import assert from "node:assert/strict";
import test from "node:test";

import { accessDenialCopy, resolvePortalAccess } from "@/lib/auth/access";
import { accessRedirectTarget } from "@/lib/auth/oauth";
import { ACCESS_DENIED_ROUTE, DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/routes";
import { capabilitiesFor, normalizeRole } from "@/lib/permissions/roles";
import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * The access rule, pinned.
 *
 * Google sign-in ends at the same question as a password sign-in: does the
 * signed-in auth user have a profile, and is that profile active? These tests
 * cover the answers, because the difference between "authenticated" and
 * "authorized" is the whole point of adding a second sign-in method.
 */

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "dana@cabinetgenies.com",
    first_name: "Dana",
    last_name: "Reed",
    display_name: null,
    role: "employee",
    department: null,
    department_id: null,
    business_role_id: null,
    manager_id: null,
    active: true,
    created_at: "2026-09-15T12:00:00.000Z",
    updated_at: "2026-09-15T12:00:00.000Z",
    ...overrides,
  };
}

test("an active profile is authorized and keeps its own role and capabilities", () => {
  const accountant = profile({ role: "accounting" });
  const access = resolvePortalAccess({ status: "found", profile: accountant });

  assert.equal(access.status, "authorized");
  if (access.status !== "authorized") return;

  // Access is decided from the profile; the profile is handed back unreduced.
  // Signing in with Google cannot promote, demote or re-scope anybody.
  assert.equal(access.profile.role, "accounting");
  assert.deepEqual(access.profile, accountant);
  assert.deepEqual(
    capabilitiesFor(normalizeRole(access.profile.role)),
    capabilitiesFor("accounting"),
  );
  assert.ok(capabilitiesFor(normalizeRole(access.profile.role)).includes("view:jobs-all"));
});

test("a Google account with no profile is denied, and told nothing else", () => {
  const access = resolvePortalAccess({ status: "missing" });

  assert.deepEqual(access, { status: "denied", reason: "no-profile" });

  const copy = accessDenialCopy("no-profile");
  assert.match(copy.guidance, /administrator/i);
  // The denial copy never mentions portal data, roles or other people.
  assert.equal(/commission|job|employee|directory/i.test(JSON.stringify(copy)), false);
});

test("a profile that exists but is not active is denied", () => {
  const access = resolvePortalAccess({
    status: "found",
    profile: profile({ active: false, role: "admin" }),
  });

  assert.deepEqual(access, { status: "denied", reason: "inactive-profile" });
});

test("a deactivated administrator is denied, and the role does not rescue them", () => {
  // The role is still reported by the data access layer so an administrator can
  // see who somebody was, but no capability follows from a denied session.
  const access = resolvePortalAccess({
    status: "found",
    profile: profile({ active: false, role: "ceo" }),
  });

  assert.equal(access.status, "denied");
});

test("a profile directory that cannot be read denies access instead of granting it", () => {
  const access = resolvePortalAccess({
    status: "unavailable",
    message: 'relation "public.profiles" does not exist',
  });

  assert.deepEqual(access, { status: "denied", reason: "directory-unavailable" });
});

test("the denial page explains each reason without leaking the reason's cause", () => {
  const noProfile = accessDenialCopy("no-profile");
  const inactive = accessDenialCopy("inactive-profile");
  const unavailable = accessDenialCopy("directory-unavailable");

  for (const copy of [noProfile, inactive, unavailable]) {
    assert.ok(copy.title.length > 0);
    assert.ok(copy.description.length > 0);
    assert.ok(copy.guidance.length > 0);
  }

  // The message the request asked for: authenticated, not authorized.
  assert.match(inactive.description, /signed in successfully/i);
  assert.match(inactive.description, /does not by itself grant access/i);
});

test("the OAuth callback sends an authorized profile on and a denied one to the denial page", () => {
  const authorized = resolvePortalAccess({ status: "found", profile: profile() });
  const denied = resolvePortalAccess({ status: "missing" });

  assert.equal(
    accessRedirectTarget({ access: authorized, next: "/sales/commissions" }),
    "/sales/commissions",
  );
  assert.equal(
    accessRedirectTarget({ access: authorized, next: null }),
    DEFAULT_AUTHENTICATED_ROUTE,
  );

  // Exchanging the code successfully is not a way around the profile check: the
  // callback routes a denied account to the denial page whatever `next` says.
  assert.equal(
    accessRedirectTarget({ access: denied, next: "/admin/users" }),
    ACCESS_DENIED_ROUTE,
  );
  assert.equal(
    accessRedirectTarget({
      access: resolvePortalAccess({ status: "found", profile: profile({ active: false }) }),
      next: "/admin/users",
    }),
    ACCESS_DENIED_ROUTE,
  );
});
