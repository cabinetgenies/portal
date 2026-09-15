-- Cabinet Genies Portal — Phase 3 preparation
-- Effective-dated manager relationships.
--
-- Why
--   profiles.manager_id remains the *current* reporting relationship and the
--   basis for supervisor job visibility (unchanged from Phase 1). It cannot
--   answer "who managed this person in March?", which future sales manager bonus
--   attribution will need: changing a person's manager must not rewrite the
--   bonus attribution of jobs they already produced.
--
-- What this migration provides
--   * public.employee_reporting_periods — one row per manager relationship
--     period, maintained automatically when profiles.manager_id changes.
--   * public.manager_of_profile_at(profile_id, on_date) — the manager in force
--     on a date.
--   * public.direct_report_ids_at(manager_id, on_date) — the manager's direct
--     reports on a date (the team-attribution primitive).
--
-- What this migration does NOT do
--   * No sales manager bonus plan, qualifying-job set, calculation, approval or
--     payment. Those are described in docs/compensation-architecture.md and stay
--     unimplemented.
--   * Nothing here writes money, and nothing reads these structures for payouts.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Reporting periods
-- ---------------------------------------------------------------------------

create table if not exists public.employee_reporting_periods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  effective_to date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_reporting_periods_effective_range
    check (effective_to is null or effective_to >= effective_from),
  constraint employee_reporting_periods_not_self
    check (manager_id <> profile_id)
);

comment on table public.employee_reporting_periods is
  'Effective-dated reporting relationships. profiles.manager_id stays the current pointer; this table preserves who managed whom over time so future manager compensation can be attributed to the manager in force on the qualifying date.';
comment on column public.employee_reporting_periods.effective_to is
  'Last day the relationship was in force. NULL means it is the current relationship.';

create index if not exists employee_reporting_periods_profile_idx
  on public.employee_reporting_periods (profile_id, effective_from desc);
create index if not exists employee_reporting_periods_manager_idx
  on public.employee_reporting_periods (manager_id, effective_from desc);

drop trigger if exists employee_reporting_periods_set_updated_at on public.employee_reporting_periods;
create trigger employee_reporting_periods_set_updated_at
  before update on public.employee_reporting_periods
  for each row
  execute function public.set_updated_at();

create or replace function public.prevent_overlapping_reporting_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.employee_reporting_periods r
    where r.profile_id = new.profile_id
      and r.id <> new.id
      and new.effective_from <= coalesce(r.effective_to, 'infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= r.effective_from
  ) then
    raise exception
      'An employee cannot report to two managers on the same day'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists employee_reporting_periods_prevent_overlap on public.employee_reporting_periods;
create trigger employee_reporting_periods_prevent_overlap
  before insert or update on public.employee_reporting_periods
  for each row
  execute function public.prevent_overlapping_reporting_periods();

-- ---------------------------------------------------------------------------
-- 2. Keep the history in step with profiles.manager_id
--
-- A manager change closes the open period the day before the change and opens a
-- new one. Two changes on the same day update the open row instead of creating a
-- zero-length period.
-- ---------------------------------------------------------------------------

create or replace function public.sync_reporting_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  open_period public.employee_reporting_periods;
begin
  if tg_op = 'UPDATE' and new.manager_id is not distinct from old.manager_id then
    return new;
  end if;

  select *
  into open_period
  from public.employee_reporting_periods r
  where r.profile_id = new.id
    and r.effective_to is null
  order by r.effective_from desc
  limit 1;

  if open_period.id is not null and open_period.effective_from >= current_date then
    -- The relationship changed on the day it started: keep a single row.
    if new.manager_id is null then
      delete from public.employee_reporting_periods where id = open_period.id;
    elsif new.manager_id <> open_period.manager_id then
      update public.employee_reporting_periods
        set manager_id = new.manager_id
        where id = open_period.id;
    end if;

    return new;
  end if;

  if open_period.id is not null then
    update public.employee_reporting_periods
      set effective_to = current_date - 1
      where id = open_period.id;
  end if;

  if new.manager_id is not null and new.manager_id <> new.id then
    insert into public.employee_reporting_periods (profile_id, manager_id, effective_from, created_by)
    values (new.id, new.manager_id, current_date, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_reporting_period on public.profiles;
create trigger profiles_sync_reporting_period
  after insert or update of manager_id on public.profiles
  for each row
  execute function public.sync_reporting_period();

-- Begin recording history for relationships that already exist.
insert into public.employee_reporting_periods (profile_id, manager_id, effective_from, notes)
select p.id, p.manager_id, current_date, 'Recorded when effective-dated reporting history was introduced.'
from public.profiles p
where p.manager_id is not null
  and p.manager_id <> p.id
  and not exists (
    select 1
    from public.employee_reporting_periods r
    where r.profile_id = p.id
      and r.effective_to is null
  );

-- ---------------------------------------------------------------------------
-- 3. Attribution primitives
--
-- These are the documented access paths for a future sales manager bonus
-- calculation. They return relationships only — never money.
-- ---------------------------------------------------------------------------

create or replace function public.manager_of_profile_at(target_profile_id uuid, on_date date)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.manager_id
      from public.employee_reporting_periods r
      where r.profile_id = target_profile_id
        and r.effective_from <= on_date
        and (r.effective_to is null or r.effective_to >= on_date)
      order by r.effective_from desc
      limit 1
    ),
    -- Fallback for dates before reporting history began: the current pointer.
    (select p.manager_id from public.profiles p where p.id = target_profile_id)
  )
$$;

comment on function public.manager_of_profile_at(uuid, date) is
  'The manager in force for a profile on a date, taken from employee_reporting_periods and falling back to profiles.manager_id for dates before history began. Used for attribution only; no compensation is calculated from it yet.';

create or replace function public.direct_report_ids_at(target_manager_id uuid, on_date date)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.active
    and public.manager_of_profile_at(p.id, on_date) = target_manager_id
$$;

comment on function public.direct_report_ids_at(uuid, date) is
  'The active direct reports of a manager on a date. This is the team-attribution primitive a future sales manager bonus plan will use to decide which jobs qualify.';

revoke all on function public.manager_of_profile_at(uuid, date) from public;
revoke all on function public.direct_report_ids_at(uuid, date) from public;
revoke all on function public.sync_reporting_period() from public;
revoke all on function public.prevent_overlapping_reporting_periods() from public;

grant execute on function public.manager_of_profile_at(uuid, date) to authenticated;
grant execute on function public.direct_report_ids_at(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
--
-- Reporting history is people data: finance and administrators can read it, and
-- an employee can read their own. Only administrators change it (and in practice
-- it is maintained by the profiles trigger rather than by hand).
-- ---------------------------------------------------------------------------

alter table public.employee_reporting_periods enable row level security;

revoke all on table public.employee_reporting_periods from anon;
grant select, insert, update, delete on table public.employee_reporting_periods to authenticated;

drop policy if exists "Reporting periods are readable by the employee, finance and administrators" on public.employee_reporting_periods;
create policy "Reporting periods are readable by the employee, finance and administrators"
  on public.employee_reporting_periods
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.current_profile_role_is('accounting', 'admin', 'ceo')
  );

drop policy if exists "Reporting periods are managed by administrators" on public.employee_reporting_periods;
create policy "Reporting periods are managed by administrators"
  on public.employee_reporting_periods
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and (created_by is null or created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. Job-level attribution is deliberately not snapshotted yet
--
-- A future phase will add an additive, nullable jobs.sales_manager_id (or an
-- equivalent attribution table) populated when a job is sold, so historical
-- bonus attribution cannot drift. It is not added here because nothing consumes
-- it yet and an unpopulated attribution column would be misleading.
-- See docs/compensation-architecture.md.
-- ---------------------------------------------------------------------------
