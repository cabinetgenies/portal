-- Cabinet Genies Portal — Phase 6.1
-- Performance & Leadership acceptance and security hardening.
--
-- This migration is additive and is designed to run after the Phase 6 files. It
-- corrects the authorization issues found in the first performance pass without
-- rewriting those files, so environments that already applied Phase 6 have the
-- same upgrade path as a fresh environment.
--
-- What changes:
--   1. Department leadership becomes an explicit administrator-managed
--      relationship instead of deriving access from a business role.
--   2. Meeting access moves through narrow SECURITY DEFINER helpers, removing the
--      circular policy recursion between meetings and meeting_participants.
--   3. Manager review notes move to a private table; employees can no longer
--      read or write manager drafts.
--   4. Review finalization evidence is stored as a structured JSON snapshot.

-- ---------------------------------------------------------------------------
-- 1. Explicit department leadership
-- ---------------------------------------------------------------------------

create table if not exists public.department_leaders (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint department_leaders_unique unique (department_id, profile_id)
);

create index if not exists department_leaders_department_idx
  on public.department_leaders (department_id);
create index if not exists department_leaders_profile_idx
  on public.department_leaders (profile_id);

alter table public.department_leaders enable row level security;

revoke all on table public.department_leaders from anon;
grant select, insert, delete on table public.department_leaders to authenticated;

drop policy if exists "Department leaders are readable by portal users"
  on public.department_leaders;
create policy "Department leaders are readable by portal users"
  on public.department_leaders
  for select
  to authenticated
  using (true);

drop policy if exists "Department leaders are managed by administrators"
  on public.department_leaders;
create policy "Department leaders are managed by administrators"
  on public.department_leaders
  for all
  to authenticated
  using (public.current_profile_is_admin())
  with check (public.current_profile_is_admin());

-- Business roles configure experience only. Department-wide data access now
-- requires a department_leaders row, which only an administrator can create.
create or replace function public.current_profile_leads_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.department_leaders dl
    where dl.department_id = target_department_id
      and dl.profile_id = auth.uid()
  );
$$;

revoke all on function public.current_profile_leads_department(uuid) from public;
grant execute on function public.current_profile_leads_department(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Non-recursive meeting access helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_meeting_participant(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meeting_participants mp
    where mp.meeting_id = target_meeting_id
      and mp.profile_id = auth.uid()
  );
$$;

revoke all on function public.is_meeting_participant(uuid) from public;
grant execute on function public.is_meeting_participant(uuid) to authenticated;

create or replace function public.can_view_meeting(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.current_profile_is_admin()
    or public.is_meeting_participant(target_meeting_id)
    or exists (
      select 1
      from public.meetings m
      where m.id = target_meeting_id
        and (
          m.created_by = auth.uid()
          or (
            m.team_department_id is not null
            and public.current_profile_leads_department(m.team_department_id)
          )
        )
    )
  );
$$;

revoke all on function public.can_view_meeting(uuid) from public;
grant execute on function public.can_view_meeting(uuid) to authenticated;

create or replace function public.can_manage_meeting(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    public.current_profile_is_admin()
    or exists (
      select 1
      from public.meetings m
      where m.id = target_meeting_id
        and (
          m.created_by = auth.uid()
          or (
            m.team_department_id is not null
            and public.current_profile_leads_department(m.team_department_id)
          )
        )
    )
  );
$$;

revoke all on function public.can_manage_meeting(uuid) from public;
grant execute on function public.can_manage_meeting(uuid) to authenticated;

-- Replace the meeting/participant/headline policies so none of them reads the
-- other table's RLS policy directly.

drop policy if exists "Meetings are visible to leaders, participants and administrators"
  on public.meetings;
create policy "Meetings are visible to leaders, participants and administrators"
  on public.meetings
  for select
  to authenticated
  using (public.can_view_meeting(id));

drop policy if exists "Meetings are updated by administrators and department leaders"
  on public.meetings;
create policy "Meetings are updated by administrators and department leaders"
  on public.meetings
  for update
  to authenticated
  using (public.can_manage_meeting(id))
  with check (public.can_manage_meeting(id));

alter table public.meeting_participants enable row level security;
revoke all on table public.meeting_participants from anon;
grant select, insert, delete on table public.meeting_participants to authenticated;

drop policy if exists "Meeting participants are visible to meeting audience"
  on public.meeting_participants;
create policy "Meeting participants are visible to meeting audience"
  on public.meeting_participants
  for select
  to authenticated
  using (public.can_view_meeting(meeting_id));

drop policy if exists "Meeting participants are added by meeting organizers"
  on public.meeting_participants;
create policy "Meeting participants are added by meeting organizers"
  on public.meeting_participants
  for insert
  to authenticated
  with check (public.can_manage_meeting(meeting_id));

drop policy if exists "Meeting participants are removed by meeting organizers"
  on public.meeting_participants;
create policy "Meeting participants are removed by meeting organizers"
  on public.meeting_participants
  for delete
  to authenticated
  using (public.can_manage_meeting(meeting_id));

drop policy if exists "Headlines are visible to meeting audience and department leaders"
  on public.meeting_headlines;
create policy "Headlines are visible to meeting audience and department leaders"
  on public.meeting_headlines
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
    or (meeting_id is not null and public.can_view_meeting(meeting_id))
  );

drop policy if exists "Headlines are created by meeting leaders and administrators"
  on public.meeting_headlines;
create policy "Headlines are created by meeting leaders and administrators"
  on public.meeting_headlines
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      public.current_profile_is_admin()
      or (meeting_id is not null and public.can_manage_meeting(meeting_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Review privacy and authorization
-- ---------------------------------------------------------------------------

create table if not exists public.performance_review_manager_notes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null
    references public.performance_reviews (id) on delete cascade,
  body text not null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_review_manager_notes_review_key unique (review_id),
  constraint performance_review_manager_notes_body_not_blank check (btrim(body) <> '')
);

create index if not exists performance_review_manager_notes_review_idx
  on public.performance_review_manager_notes (review_id);

-- Preserve any manager notes created by the Phase 6 code before removing the
-- column from the employee-visible review row.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'performance_reviews'
      and column_name = 'manager_notes'
  ) then
    insert into public.performance_review_manager_notes (review_id, body, updated_by)
    select id, manager_notes, created_by
    from public.performance_reviews
    where manager_notes is not null
    on conflict (review_id) do nothing;

    alter table public.performance_reviews drop column if exists manager_notes;
  end if;
end;
$$;

alter table public.performance_reviews
  add column if not exists finalized_by uuid references public.profiles (id) on delete set null,
  add column if not exists finalized_at timestamptz,
  add column if not exists snapshot_data jsonb not null default '{}'::jsonb;

create index if not exists performance_reviews_finalized_at_idx
  on public.performance_reviews (finalized_at);

alter table public.performance_review_manager_notes enable row level security;

revoke all on table public.performance_review_manager_notes from anon;
grant select, insert, update, delete on table public.performance_review_manager_notes to authenticated;

drop policy if exists "Manager review notes are visible to reviewer and administrators"
  on public.performance_review_manager_notes;
create policy "Manager review notes are visible to reviewer and administrators"
  on public.performance_review_manager_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.performance_reviews r
      where r.id = review_id
        and (
          public.current_profile_is_admin()
          or r.manager_id = auth.uid()
        )
    )
  );

drop policy if exists "Manager review notes are written by reviewer and administrators"
  on public.performance_review_manager_notes;
create policy "Manager review notes are written by reviewer and administrators"
  on public.performance_review_manager_notes
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.performance_reviews r
      where r.id = review_id
        and (
          public.current_profile_is_admin()
          or r.manager_id = auth.uid()
        )
    )
  );

drop policy if exists "Manager review notes are updated by reviewer and administrators"
  on public.performance_review_manager_notes;
create policy "Manager review notes are updated by reviewer and administrators"
  on public.performance_review_manager_notes
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.performance_reviews r
      where r.id = review_id
        and (
          public.current_profile_is_admin()
          or r.manager_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.performance_reviews r
      where r.id = review_id
        and (
          public.current_profile_is_admin()
          or r.manager_id = auth.uid()
        )
    )
  );

drop policy if exists "Manager review notes are deleted by reviewer and administrators"
  on public.performance_review_manager_notes;
create policy "Manager review notes are deleted by reviewer and administrators"
  on public.performance_review_manager_notes
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.performance_reviews r
      where r.id = review_id
        and (
          public.current_profile_is_admin()
          or r.manager_id = auth.uid()
        )
    )
  );

drop policy if exists "Reviews are visible to employee, manager and administrators"
  on public.performance_reviews;
create policy "Reviews are visible to employee, manager and administrators"
  on public.performance_reviews
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or employee_id = auth.uid()
    or manager_id = auth.uid()
  );

drop policy if exists "Reviews are created by managers and administrators"
  on public.performance_reviews;
create policy "Reviews are created by managers and administrators"
  on public.performance_reviews
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    or (
      manager_id = auth.uid()
      and public.manages_profile(employee_id)
    )
  );

drop policy if exists "Reviews are updated by employee, manager and administrators"
  on public.performance_reviews;
create policy "Reviews are updated by employee, manager and administrators"
  on public.performance_reviews
  for update
  to authenticated
  using (
    public.current_profile_is_admin()
    or employee_id = auth.uid()
    or manager_id = auth.uid()
  )
  with check (
    public.current_profile_is_admin()
    or employee_id = auth.uid()
    or manager_id = auth.uid()
  );

create or replace function public.protect_performance_review_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id
    or new.manager_id is distinct from old.manager_id
  then
    if not public.current_profile_is_admin() then
      raise exception 'Reviewer and employee are protected and cannot be changed'
        using errcode = '42501';
    end if;
  end if;

  if old.status = 'complete' and not public.current_profile_is_admin() then
    raise exception 'A completed review cannot be changed'
      using errcode = '42501';
  end if;

  if new.employee_id = auth.uid() and not public.current_profile_is_admin() then
    if new.status <> 'employee_input' then
      raise exception 'Employees may submit review input, not change review status'
        using errcode = '42501';
    end if;

    if new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.scheduled_date is distinct from old.scheduled_date
      or new.completed_date is distinct from old.completed_date
      or new.overall_summary is distinct from old.overall_summary
      or new.development_actions is distinct from old.development_actions
      or new.measurable_snapshot_ids is distinct from old.measurable_snapshot_ids
      or new.priority_snapshot_ids is distinct from old.priority_snapshot_ids
      or new.knowledge_item_snapshot_ids is distinct from old.knowledge_item_snapshot_ids
      or new.snapshot_data is distinct from old.snapshot_data
      or new.finalized_by is distinct from old.finalized_by
      or new.finalized_at is distinct from old.finalized_at
    then
      raise exception 'Employees cannot change protected review fields'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.manager_id = auth.uid() and not public.current_profile_is_admin() then
    if new.employee_notes is distinct from old.employee_notes then
      raise exception 'Managers cannot edit employee review input'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if not public.current_profile_is_admin() then
    raise exception 'Not authorized to update this review'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_performance_review_update() from public;

drop trigger if exists performance_reviews_protect_update on public.performance_reviews;
create trigger performance_reviews_protect_update
  before update on public.performance_reviews
  for each row
  execute function public.protect_performance_review_update();

-- ---------------------------------------------------------------------------
-- 4. updated_at and audit triggers for the new tables
-- ---------------------------------------------------------------------------

drop trigger if exists performance_review_manager_notes_set_updated_at
  on public.performance_review_manager_notes;
create trigger performance_review_manager_notes_set_updated_at
  before update on public.performance_review_manager_notes
  for each row
  execute function public.set_updated_at();

drop trigger if exists performance_review_manager_notes_audit
  on public.performance_review_manager_notes;
create trigger performance_review_manager_notes_audit
  after insert or update on public.performance_review_manager_notes
  for each row
  execute function public.log_config_audit_event('performance_review_manager_note');

drop trigger if exists department_leaders_audit on public.department_leaders;
create trigger department_leaders_audit
  after insert on public.department_leaders
  for each row
  execute function public.log_config_audit_event('department_leader');
