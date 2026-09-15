-- Cabinet Genies Portal — Phase 1
-- Profiles, role architecture and Row Level Security.
--
-- Run this in the Supabase SQL editor (or with `supabase db push` once the CLI
-- is linked). It is idempotent, so re-running it is safe.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  display_name text,
  role text not null default 'employee'
    constraint profiles_role_check
    check (role in ('employee', 'supervisor', 'accounting', 'admin', 'ceo')),
  department text,
  manager_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Portal user profile, one row per auth.users row. Holds the role and reporting line used for portal authorization.';
comment on column public.profiles.role is
  'Portal role. employee | supervisor | accounting | admin | ceo.';
comment on column public.profiles.manager_id is
  'Direct manager. Drives future direct-report visibility for supervisors.';
comment on column public.profiles.active is
  'Inactive profiles keep their history but should not be treated as active portal users.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_department_idx on public.profiles (department);
create index if not exists profiles_manager_id_idx on public.profiles (manager_id);
create index if not exists profiles_active_idx on public.profiles (active);
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

-- ---------------------------------------------------------------------------
-- 3. Helper functions
--
-- These are SECURITY DEFINER on purpose: policies on public.profiles that read
-- public.profiles would otherwise recurse into their own policies.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active
$$;

create or replace function public.current_profile_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role in ('admin', 'ceo')
      from public.profiles p
      where p.id = auth.uid()
        and p.active
    ),
    false
  )
$$;

create or replace function public.manages_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_profile_id
      and p.manager_id = auth.uid()
  )
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_profile_is_admin() from public;
revoke all on function public.manages_profile(uuid) from public;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_is_admin() to authenticated;
grant execute on function public.manages_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Timestamps and self-service guard rails
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- A user may edit their own profile row, but only administrators may change the
-- fields that decide what that row is allowed to do.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.manager_id is distinct from old.manager_id
    or new.department is distinct from old.department
    or new.email is distinct from old.email
  then
    raise exception
      'Only administrators can change role, department, manager, active or email'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 5. Automatic profile creation for new auth users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first_name text := nullif(trim(coalesce(meta ->> 'first_name', '')), '');
  v_last_name text := nullif(trim(coalesce(meta ->> 'last_name', '')), '');
  v_display_name text := nullif(trim(coalesce(meta ->> 'display_name', '')), '');
begin
  insert into public.profiles (id, email, first_name, last_name, display_name, role, department)
  values (
    new.id,
    new.email,
    v_first_name,
    v_last_name,
    coalesce(v_display_name, nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '')),
    'employee',
    nullif(trim(coalesce(meta ->> 'department', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Keep the profile email in step when the auth email changes.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_user_email_change() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.protect_profile_privileged_columns() from public;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
grant select, update on table public.profiles to authenticated;

-- Read: your own profile.
drop policy if exists "Profiles are viewable by their owner" on public.profiles;
create policy "Profiles are viewable by their owner"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

-- Read: a supervisor can see the profiles assigned to them. This is the hook for
-- direct-report visibility in later phases.
drop policy if exists "Profiles are viewable by the assigned manager" on public.profiles;
create policy "Profiles are viewable by the assigned manager"
  on public.profiles
  for select
  to authenticated
  using (public.manages_profile(id));

-- Read: administrators and the CEO can see every profile.
drop policy if exists "Profiles are viewable by administrators" on public.profiles;
create policy "Profiles are viewable by administrators"
  on public.profiles
  for select
  to authenticated
  using (public.current_profile_is_admin());

-- Write: your own profile (the trigger above blocks privileged columns).
drop policy if exists "Profiles are editable by their owner" on public.profiles;
create policy "Profiles are editable by their owner"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Write: administrators and the CEO can update any profile.
drop policy if exists "Profiles are editable by administrators" on public.profiles;
create policy "Profiles are editable by administrators"
  on public.profiles
  for update
  to authenticated
  using (public.current_profile_is_admin())
  with check (public.current_profile_is_admin());

-- Deliberately no INSERT or DELETE policy:
--   * rows are created by the auth.users trigger (SECURITY DEFINER), and
--   * rows are removed by the ON DELETE CASCADE when an auth user is deleted.
-- Nothing in the browser should ever insert or delete profiles.
