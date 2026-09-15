import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The database half of "one person, one profile, no access by default".
 *
 * These are contracts the application relies on but cannot enforce itself: the
 * portal could ask nicely, and a Google sign-in would still create whatever
 * Supabase's trigger creates. The guarantees therefore live in the migrations,
 * and this test pins the lines that provide them so a later edit has to be a
 * deliberate one.
 */

function migration(fileName: string) {
  return readFileSync(
    path.join(process.cwd(), "supabase", "migrations", fileName),
    "utf8",
  )
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const PROFILES = migration("20260915090000_create_profiles.sql");
const GOOGLE_SIGN_IN = migration("20260915240000_google_sign_in.sql");

test("a profile is the auth user, so a person cannot have two of them", () => {
  // id is the primary key *and* the foreign key to auth.users: one row per auth
  // user, by construction. A second Google identity for the same person therefore
  // joins the existing row instead of adding one.
  assert.ok(
    PROFILES.includes("id uuid primary key references auth.users (id) on delete cascade"),
  );

  // …and the email index stops a second profile being created for one address
  // even if somebody tries to link the same person twice.
  assert.ok(
    PROFILES.includes(
      "create unique index if not exists profiles_email_unique_idx on public.profiles (lower(email)) where email is not null",
    ),
  );
});

test("the sign-up trigger upserts, so signing in twice cannot duplicate a profile", () => {
  assert.ok(GOOGLE_SIGN_IN.includes("insert into public.profiles ("));
  assert.ok(
    GOOGLE_SIGN_IN.includes(
      "on conflict (id) do update set email = excluded.email, updated_at = now();",
    ),
  );
});

test("a new auth user is created with no portal access", () => {
  // The active column is written explicitly as false in the insert. Google
  // sign-in, a password sign-up and an account created in the dashboard all
  // arrive here, and all of them arrive unauthorized.
  assert.ok(GOOGLE_SIGN_IN.includes("department, active ) values ("));
  assert.ok(
    GOOGLE_SIGN_IN.includes("nullif(trim(coalesce(meta ->> 'department', '')), ''), false )"),
    "the trigger must insert active = false",
  );
  assert.equal(
    /nullif\(trim\(coalesce\(meta ->> 'department', ''\)\), ''\), true \)/.test(
      GOOGLE_SIGN_IN,
    ),
    false,
    "the trigger must never insert active = true",
  );
});

test("a new profile gets the least-privileged role, never an elevated one", () => {
  assert.ok(GOOGLE_SIGN_IN.includes("'employee', nullif(trim(coalesce(meta ->> 'department'"));

  for (const role of ["'admin'", "'ceo'", "'accounting'", "'supervisor'"]) {
    assert.equal(
      GOOGLE_SIGN_IN.includes(`values (${role}`),
      false,
      `${role} must not be assigned by the sign-up trigger`,
    );
  }
});

test("an unapproved person cannot approve themselves", () => {
  // Profiles are updatable by their owner, so the guard has to be in the trigger:
  // only an administrator may move `active`, `role`, `department`, `manager` or
  // `email`. A pending Google user can therefore edit their name and nothing else.
  assert.ok(PROFILES.includes("new.active is distinct from old.active"));
  assert.ok(
    PROFILES.includes("only administrators can change role, department, manager, active or email"),
  );
  assert.ok(
    PROFILES.includes("if new.role is distinct from old.role or new.active is distinct from old.active"),
  );
});

test("reading the role requires an active profile, so RLS follows the same rule", () => {
  // Every capability check in the database is built on these helpers, and both of
  // them require `p.active`. An unapproved account resolves to no role at all.
  const currentRole = PROFILES.slice(PROFILES.indexOf("create or replace function public.current_profile_role()"));

  assert.ok(currentRole.includes("where p.id = auth.uid() and p.active"));
  assert.ok(PROFILES.includes("create or replace function public.current_profile_is_admin()"));
  assert.ok(PROFILES.includes("where p.id = auth.uid() and p.active"));
});
