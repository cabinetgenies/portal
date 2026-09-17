-- Project team support for the lightweight BOS project registry.
create table if not exists public.job_team_members (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_label text not null,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_team_members_role_label_check check (char_length(btrim(role_label)) between 2 and 80),
  constraint job_team_members_job_profile_key unique (job_id, profile_id)
);

create index if not exists job_team_members_job_id_idx
  on public.job_team_members(job_id, sort_order, created_at);

alter table public.job_team_members enable row level security;

create policy "Project team is readable with the project"
  on public.job_team_members
  for select
  to authenticated
  using (
    current_profile_role_is(variadic array['accounting', 'admin', 'ceo'])
    or exists (
      select 1
      from public.jobs j
      where j.id = job_team_members.job_id
        and (j.sales_designer_id = auth.uid() or manages_profile(j.sales_designer_id))
    )
  );

create policy "Project team is managed by administrators"
  on public.job_team_members
  for insert
  to authenticated
  with check (
    current_profile_role_is(variadic array['admin', 'ceo'])
    and created_by = auth.uid()
  );

create policy "Project team is updated by administrators"
  on public.job_team_members
  for update
  to authenticated
  using (current_profile_role_is(variadic array['admin', 'ceo']))
  with check (current_profile_role_is(variadic array['admin', 'ceo']));

create policy "Project team is removed by administrators"
  on public.job_team_members
  for delete
  to authenticated
  using (current_profile_role_is(variadic array['admin', 'ceo']));

grant select, insert, update, delete on public.job_team_members to authenticated;
revoke all on public.job_team_members from anon;

create trigger job_team_members_set_updated_at
  before update on public.job_team_members
  for each row execute function public.set_updated_at();

-- Fix the commission workflow trigger. The original trigger used the retired
-- commission_plan_version_id column name, which caused approval/void updates to
-- fail before the event could be saved.
create or replace function public.enforce_commission_event_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  actor_role text := public.current_profile_role();
  financial_changed boolean;
  transition_allowed boolean := false;
begin
  if old.status = 'paid' then
    raise exception 'Paid commission events are immutable; create an adjustment instead'
      using errcode = '42501';
  end if;

  if old.status = 'voided' then
    raise exception 'Voided commission events are immutable'
      using errcode = '42501';
  end if;

  financial_changed :=
       new.commissionable_gp is distinct from old.commissionable_gp
    or new.commissionable_gp_percent is distinct from old.commissionable_gp_percent
    or new.standard_commission_rate is distinct from old.standard_commission_rate
    or new.effective_commission_rate is distinct from old.effective_commission_rate
    or new.draw_rate_reduction is distinct from old.draw_rate_reduction
    or new.job_gross_commission is distinct from old.job_gross_commission
    or new.gross_commission is distinct from old.gross_commission
    or new.previously_recognized is distinct from old.previously_recognized
    or new.compensation_plan_version_id is distinct from old.compensation_plan_version_id;

  if old.status = 'approved' and financial_changed then
    raise exception
      'An approved commission event cannot be recalculated; void it or create an adjustment'
      using errcode = '42501';
  end if;

  transition_allowed :=
       (old.status = 'calculated' and new.status in ('calculated', 'pending_approval', 'voided'))
    or (old.status = 'pending_approval' and new.status in ('pending_approval', 'approved', 'voided'))
    or (old.status = 'approved' and new.status in ('approved', 'paid', 'voided'));

  if not transition_allowed then
    raise exception 'Commission event cannot move from % to %', old.status, new.status
      using errcode = '23514';
  end if;

  if actor_role is null then
    return new;
  end if;

  if actor_role = 'accounting' then
    if old.status <> 'calculated' or new.status not in ('calculated', 'pending_approval') then
      raise exception
        'Accounting can calculate and submit commission events; approval, payment and voiding belong to an administrator'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if actor_role not in ('admin', 'ceo') then
    raise exception 'This role cannot change commission events' using errcode = '42501';
  end if;

  if new.status in ('approved', 'paid', 'voided') then
    if new.status = 'approved' then
      if new.approved_by is null or new.approved_at is null then
        raise exception 'Approving a commission event requires an approver and a timestamp'
          using errcode = '23514';
      end if;
    end if;

    if new.status = 'paid' and new.paid_at is null then
      raise exception 'Marking a commission event paid requires a payment timestamp'
        using errcode = '23514';
    end if;

    if new.status = 'voided' and (new.void_reason is null or btrim(new.void_reason) = '') then
      raise exception 'Voiding a commission event requires a reason'
        using errcode = '23514';
    end if;

    if new.status = 'voided' and new.voided_at is null then
      raise exception 'Voiding a commission event requires a timestamp'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;
