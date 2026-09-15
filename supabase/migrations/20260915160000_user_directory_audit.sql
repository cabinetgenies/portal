-- Cabinet Genies Portal — Phase 3.5
-- User directory: profile audit trail and the single policy the directory needs.
--
-- What this adds
--   1. A profile audit trigger. Creating a portal user and the privileged-column
--      changes the user directory performs (role, manager, active status,
--      department, email, names) are recorded in public.audit_events. The rows are
--      written by a SECURITY DEFINER trigger, so the application can neither
--      fabricate nor rewrite them — the same rule the Phase 2 configuration tables
--      already follow.
--   2. An INSERT policy for administrators, so a profile can be linked to an
--      existing Supabase Auth user (auth.users) from the user directory. This is
--      only reachable for accounts that exist in Supabase Auth already; the
--      foreign key to auth.users makes sure of that.
--
-- What this deliberately does NOT add
--   No auth.users rows are created here, and no password material is stored in the
--   portal schema. Portal users are created through the Supabase Auth Admin API.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Profile audit trail
--
-- One row per concern, so the history reads as sentences ("role changed",
-- "manager changed") instead of a single opaque diff.
-- ---------------------------------------------------------------------------

create or replace function public.log_profile_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  previous_manager jsonb;
  next_manager jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'user_created',
      actor,
      jsonb_build_object('after', to_jsonb(new) - 'created_at' - 'updated_at')
    );

    return new;
  end if;

  if new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.display_name is distinct from old.display_name
  then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'user_name_changed',
      actor,
      jsonb_build_object(
        'first_name', jsonb_build_object('from', old.first_name, 'to', new.first_name),
        'last_name', jsonb_build_object('from', old.last_name, 'to', new.last_name),
        'display_name', jsonb_build_object('from', old.display_name, 'to', new.display_name)
      )
    );
  end if;

  if new.role is distinct from old.role then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'role_changed',
      actor,
      jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', new.role))
    );
  end if;

  if new.department is distinct from old.department then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'department_changed',
      actor,
      jsonb_build_object(
        'department', jsonb_build_object('from', old.department, 'to', new.department)
      )
    );
  end if;

  if new.manager_id is distinct from old.manager_id then
    -- Resolve both sides to a readable name as well as the id, so the audit entry
    -- still makes sense after a profile is renamed.
    select jsonb_build_object(
             'manager_id', p.id,
             'manager_name', coalesce(
               nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
               p.display_name,
               p.email
             )
           )
      into previous_manager
      from public.profiles p
      where p.id = old.manager_id;

    select jsonb_build_object(
             'manager_id', p.id,
             'manager_name', coalesce(
               nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
               p.display_name,
               p.email
             )
           )
      into next_manager
      from public.profiles p
      where p.id = new.manager_id;

    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'manager_changed',
      actor,
      jsonb_build_object('from', previous_manager, 'to', next_manager)
    );
  end if;

  if new.active is distinct from old.active then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'active_status_changed',
      actor,
      jsonb_build_object('active', jsonb_build_object('from', old.active, 'to', new.active))
    );
  end if;

  if new.email is distinct from old.email then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'user_email_changed',
      actor,
      jsonb_build_object('email', jsonb_build_object('from', old.email, 'to', new.email))
    );
  end if;

  return new;
end;
$$;

comment on function public.log_profile_audit_event() is
  'Writes one append-only audit row per profile change: user created, name, role, department, manager, active status and email. Runs as SECURITY DEFINER so portal code cannot fabricate or edit the history.';

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update on public.profiles
  for each row
  execute function public.log_profile_audit_event();

-- ---------------------------------------------------------------------------
-- 2. Linking a profile to an existing Supabase Auth user
--
-- Portal users created in the Supabase dashboard (or by an invite) get a profile
-- row from the on_auth_user_created trigger. This policy covers the remaining
-- case: an auth user that exists without a matching profile row. The insert is
-- admin/CEO only, and the foreign key to auth.users means a profile can never be
-- attached to a user that does not exist.
-- ---------------------------------------------------------------------------

drop policy if exists "Profiles can be linked by administrators" on public.profiles;
create policy "Profiles can be linked by administrators"
  on public.profiles
  for insert
  to authenticated
  with check (public.current_profile_is_admin());

revoke all on function public.log_profile_audit_event() from public;
