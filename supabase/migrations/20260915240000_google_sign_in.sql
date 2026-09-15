-- Cabinet Genies Portal — Phase 6
-- Google sign-in: authenticating is not authorizing.
--
-- What this changes
--   One thing, and one thing only: the sign-up trigger no longer hands a new
--   auth user portal access. Every profile it creates starts with
--   `active = false`, so signing in with Google (or signing up with a password)
--   produces the row an administrator approves — never a working account.
--
-- Why the database, and not the application
--   An auth user can come into existence before the portal sees the request: an
--   OAuth sign-in is exactly that. Approval therefore has to be something that is
--   granted explicitly, not something that is assumed when a row appears. The
--   same trigger already reads the name from the user metadata; it now also
--   decides that "new" means "not yet approved".
--
-- What deliberately does not change
--   No table, column, policy or grant is touched. `active` was already the
--   portal's access flag, `profiles_protect_privileged_columns` already stops a
--   person from activating their own profile, and the user directory already
--   approves somebody by setting their status to Active. Google sign-in reuses
--   that decision rather than inventing a second one.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. New auth users arrive unapproved
--
-- The trigger runs SECURITY DEFINER as the auth service. It still fills in the
-- name where the provider supplies one — Google sends given_name, family_name
-- and full_name in raw_user_meta_data — so the row an administrator reviews in
-- Admin → Users reads as a person and not as a bare email address.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first_name text := nullif(
    trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', '')),
    ''
  );
  v_last_name text := nullif(
    trim(coalesce(meta ->> 'last_name', meta ->> 'family_name', '')),
    ''
  );
  v_display_name text := nullif(
    trim(coalesce(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name', '')),
    ''
  );
begin
  insert into public.profiles (
    id,
    email,
    first_name,
    last_name,
    display_name,
    role,
    department,
    active
  )
  values (
    new.id,
    new.email,
    v_first_name,
    v_last_name,
    coalesce(
      v_display_name,
      nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '')
    ),
    -- Never an elevated role, and never an inheriting one: a new profile is an
    -- employee with no access, and both facts are the administrator's to change.
    'employee',
    nullif(trim(coalesce(meta ->> 'department', '')), ''),
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the portal profile for a new auth user: details from the provider, role employee, and no portal access until an administrator activates the profile.';

revoke all on function public.handle_new_user() from public;

-- The trigger itself is unchanged; re-created only so a fresh database and an
-- upgraded one match.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Say what `active` means now
-- ---------------------------------------------------------------------------

comment on column public.profiles.active is
  'Portal access, granted by an administrator. A profile created by the auth trigger starts inactive: signing in with Google or a password authenticates the person, it does not authorize them.';

-- ---------------------------------------------------------------------------
-- 3. Existing profiles are untouched
--
-- Re-running this migration cannot deactivate anybody: the trigger only fires on
-- INSERT into auth.users, so every profile that exists today keeps its current
-- role, department, manager and access. Only a brand-new identity — a first
-- Google sign-in, or an account created in Supabase Auth — starts inactive, and
-- the portal's own provisioning flow activates the profile it just created.
-- ---------------------------------------------------------------------------
