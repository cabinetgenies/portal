-- Cabinet Genies Portal — Phase 3
-- Commission engine: configurable rules, calculated events, payout workflow,
-- draw-against-commission ledger and negative true-up rollover ledger.
--
-- Principles encoded here
--   * Rates come from configuration (compensation_plan_tiers + commission_settings),
--     never from application constants.
--   * A commission event snapshots every rule input it used (GP, GP %, rates,
--     plan version, deposit %, offsets). Later settings changes cannot rewrite it.
--   * Offsets always follow one order: rollover obligation, then draw balance,
--     then payable cash commission.
--   * Ledgers are append-only. Balances are derived from the ledger, never stored
--     as a single mutable number.
--   * Critical actions are idempotent: a job can have at most one deposit event
--     and at most one final true-up event, and an event can post at most one
--     offset of each kind.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Commission settings (effective-dated rule inputs)
-- ---------------------------------------------------------------------------

create table if not exists public.commission_settings (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  deposit_payout_percent numeric(9,6) not null default 0.500000,
  draw_rate_reduction numeric(9,6) not null default 0.050000,
  draw_enabled boolean not null default true,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_settings_deposit_percent_range
    check (deposit_payout_percent >= 0 and deposit_payout_percent <= 1),
  constraint commission_settings_draw_reduction_range
    check (draw_rate_reduction >= 0 and draw_rate_reduction <= 1)
);

comment on table public.commission_settings is
  'Effective-dated commission rule inputs that are not part of a plan version: deposit payout percentage, draw rate reduction and whether the draw system is enabled. Every commission event snapshots the values it used, so editing these never rewrites history.';
comment on column public.commission_settings.draw_rate_reduction is
  'Absolute reduction in commission rate (percentage points as a decimal) applied when an employee is on draw against commission. Default 0.05 = 5 points. This is a subtraction, never a multiplication, and the result never goes below zero.';

create unique index if not exists commission_settings_effective_key
  on public.commission_settings (effective_from);

insert into public.commission_settings (effective_from, deposit_payout_percent, draw_rate_reduction, draw_enabled, notes)
values (date '1900-01-01', 0.500000, 0.050000, true, 'Cabinet Genies defaults: deposit payout 50% of projected commission, draw rate reduction 5 percentage points.')
on conflict (effective_from) do nothing;

drop trigger if exists commission_settings_set_updated_at on public.commission_settings;
create trigger commission_settings_set_updated_at
  before update on public.commission_settings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Effective-dated draw enrollment
--
-- Presence of a period means the employee is on draw for those dates. Removing
-- someone from draw closes the period; it never deletes the record.
-- ---------------------------------------------------------------------------

create table if not exists public.employee_draw_periods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  effective_from date not null,
  effective_to date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_draw_periods_effective_range
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.employee_draw_periods is
  'Effective-dated draw-against-commission enrollment. A period in force means the employee''s commission rate is reduced by the configured draw reduction for jobs calculated in that window.';

create index if not exists employee_draw_periods_profile_idx
  on public.employee_draw_periods (profile_id, effective_from desc);

create or replace function public.prevent_overlapping_draw_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.employee_draw_periods p
    where p.profile_id = new.profile_id
      and p.id <> new.id
      and new.effective_from <= coalesce(p.effective_to, 'infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= p.effective_from
  ) then
    raise exception
      'Draw enrollment periods cannot overlap for the same employee'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists employee_draw_periods_prevent_overlap on public.employee_draw_periods;
create trigger employee_draw_periods_prevent_overlap
  before insert or update on public.employee_draw_periods
  for each row
  execute function public.prevent_overlapping_draw_periods();

drop trigger if exists employee_draw_periods_set_updated_at on public.employee_draw_periods;
create trigger employee_draw_periods_set_updated_at
  before update on public.employee_draw_periods
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Draw ledger
--
-- Signed convention: a positive amount increases the outstanding draw (an
-- advance), a negative amount reduces it (commission offset, repayment or a
-- documented manual correction).
-- ---------------------------------------------------------------------------

create table if not exists public.employee_draw_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  transaction_type text not null,
  amount numeric(14,2) not null,
  job_id uuid references public.jobs (id) on delete set null,
  commission_event_id uuid,
  reason text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint employee_draw_ledger_type_supported
    check (transaction_type in ('draw_advance', 'commission_offset', 'manual_adjustment', 'repayment')),
  constraint employee_draw_ledger_reason_not_blank check (btrim(reason) <> '')
);

comment on table public.employee_draw_ledger is
  'Append-only draw ledger. Outstanding draw balance is the sum of the signed amounts, never a stored number. Corrections are new rows.';

create index if not exists employee_draw_ledger_profile_idx
  on public.employee_draw_ledger (profile_id, created_at desc);
create unique index if not exists employee_draw_ledger_event_key
  on public.employee_draw_ledger (commission_event_id, transaction_type)
  where commission_event_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Rollover ledger (negative true-ups)
--
-- Signed convention: a positive amount increases the rollover the employee owes
-- (a negative true-up), a negative amount reduces it (future commission offset
-- or a documented manual correction).
-- ---------------------------------------------------------------------------

create table if not exists public.commission_rollover_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  commission_event_id uuid,
  transaction_type text not null,
  amount numeric(14,2) not null,
  reason text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint commission_rollover_ledger_type_supported
    check (transaction_type in ('negative_true_up', 'future_commission_offset', 'manual_adjustment')),
  constraint commission_rollover_ledger_reason_not_blank check (btrim(reason) <> '')
);

comment on table public.commission_rollover_ledger is
  'Append-only rollover ledger for negative true-ups. A negative true-up never produces a negative payroll payment: it creates a rollover balance that future commission must absorb first.';

create index if not exists commission_rollover_ledger_profile_idx
  on public.commission_rollover_ledger (profile_id, created_at desc);
create unique index if not exists commission_rollover_ledger_event_key
  on public.commission_rollover_ledger (commission_event_id, transaction_type)
  where commission_event_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Commission events
-- ---------------------------------------------------------------------------

create table if not exists public.commission_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null,
  calculation_stage text not null,
  compensation_plan_id uuid not null references public.compensation_plans (id) on delete restrict,
  compensation_plan_version_id uuid not null references public.compensation_plan_versions (id) on delete restrict,

  -- Snapshot of the rules and figures used. These never change afterwards.
  commissionable_gp numeric(14,2) not null default 0,
  commissionable_gp_percent numeric(9,6) not null default 0,
  tier_label text,
  standard_commission_rate numeric(9,6) not null default 0,
  draw_rate_reduction numeric(9,6) not null default 0,
  effective_commission_rate numeric(9,6) not null default 0,
  job_gross_commission numeric(14,2) not null default 0,
  deposit_payout_percent numeric(9,6) not null default 0,
  gross_commission numeric(14,2) not null default 0,
  previously_recognized numeric(14,2) not null default 0,

  -- Offset application (rollover first, then draw, then payable).
  rollover_offset numeric(14,2) not null default 0,
  draw_offset numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,

  status text not null default 'calculated',
  void_reason text,
  voided_by uuid references public.profiles (id) on delete set null,
  voided_at timestamptz,
  calculation_metadata jsonb not null default '{}'::jsonb,

  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commission_events_type_supported
    check (event_type in ('deposit', 'final_true_up', 'manual_adjustment', 'rollover_application')),
  constraint commission_events_stage_supported
    check (calculation_stage in ('projected', 'final')),
  constraint commission_events_status_supported
    check (status in ('calculated', 'pending_approval', 'approved', 'paid', 'voided')),
  constraint commission_events_rates_range
    check (
      standard_commission_rate >= 0 and standard_commission_rate <= 1
      and draw_rate_reduction >= 0 and draw_rate_reduction <= 1
      and effective_commission_rate >= 0 and effective_commission_rate <= 1
    ),
  constraint commission_events_offsets_non_negative
    check (rollover_offset >= 0 and draw_offset >= 0 and net_payable >= 0),
  constraint commission_events_deposit_percent_range
    check (deposit_payout_percent >= 0 and deposit_payout_percent <= 1),
  constraint commission_events_void_requires_reason
    check (status <> 'voided' or (void_reason is not null and btrim(void_reason) <> '')),
  constraint commission_events_void_requires_actor
    check (status <> 'voided' or voided_at is not null),
  constraint commission_events_paid_requires_approval
    check (status <> 'paid' or approved_at is not null)
);

comment on table public.commission_events is
  'Canonical commission ledger. Each row is one calculated commission event for one job and one participant, with every rule input it used snapshotted so historical calculations never drift when settings or plans change.';
comment on column public.commission_events.event_type is
  'deposit = 50% (configurable) of projected commission at deposit; final_true_up = final audited commission minus what was already recognized; manual_adjustment / rollover_application = documented adjustments.';
comment on column public.commission_events.net_payable is
  'What becomes payable cash commission after the rollover obligation and the outstanding draw have been applied, in that order.';
comment on column public.commission_events.void_reason is
  'Required when an unpaid event is voided. Voided events are immutable and keep their original snapshot for audit.';

create index if not exists commission_events_job_idx
  on public.commission_events (job_id, created_at desc);
create index if not exists commission_events_profile_idx
  on public.commission_events (profile_id, created_at desc);
create index if not exists commission_events_status_idx
  on public.commission_events (status, created_at desc);

-- Idempotency: at most one deposit event and one final true-up per job.
create unique index if not exists commission_events_job_stage_key
  on public.commission_events (job_id, event_type)
  where event_type in ('deposit', 'final_true_up');

drop trigger if exists commission_events_set_updated_at on public.commission_events;
create trigger commission_events_set_updated_at
  before update on public.commission_events
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Ledger guards: balances may never go negative, rows are append-only
-- ---------------------------------------------------------------------------

create or replace function public.guard_draw_ledger_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric(14,2);
begin
  select coalesce(sum(amount), 0) into current_balance
  from public.employee_draw_ledger l
  where l.profile_id = new.profile_id;

  if current_balance + new.amount < -0.005 then
    raise exception
      'This entry would take the outstanding draw below zero (current %, entry %)',
      current_balance, new.amount
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists employee_draw_ledger_guard on public.employee_draw_ledger;
create trigger employee_draw_ledger_guard
  before insert on public.employee_draw_ledger
  for each row
  execute function public.guard_draw_ledger_balance();

create or replace function public.guard_rollover_ledger_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric(14,2);
begin
  select coalesce(sum(amount), 0) into current_balance
  from public.commission_rollover_ledger l
  where l.profile_id = new.profile_id;

  if current_balance + new.amount < -0.005 then
    raise exception
      'This entry would take the outstanding rollover below zero (current %, entry %)',
      current_balance, new.amount
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists commission_rollover_ledger_guard on public.commission_rollover_ledger;
create trigger commission_rollover_ledger_guard
  before insert on public.commission_rollover_ledger
  for each row
  execute function public.guard_rollover_ledger_balance();

drop trigger if exists employee_draw_ledger_no_update on public.employee_draw_ledger;
create trigger employee_draw_ledger_no_update
  before update on public.employee_draw_ledger
  for each row
  execute function public.reject_row_mutation();

drop trigger if exists employee_draw_ledger_no_delete on public.employee_draw_ledger;
create trigger employee_draw_ledger_no_delete
  before delete on public.employee_draw_ledger
  for each row
  execute function public.reject_row_mutation();

drop trigger if exists commission_rollover_ledger_no_update on public.commission_rollover_ledger;
create trigger commission_rollover_ledger_no_update
  before update on public.commission_rollover_ledger
  for each row
  execute function public.reject_row_mutation();

drop trigger if exists commission_rollover_ledger_no_delete on public.commission_rollover_ledger;
create trigger commission_rollover_ledger_no_delete
  before delete on public.commission_rollover_ledger
  for each row
  execute function public.reject_row_mutation();

drop trigger if exists commission_events_no_delete on public.commission_events;
create trigger commission_events_no_delete
  before delete on public.commission_events
  for each row
  execute function public.reject_row_mutation();

-- ---------------------------------------------------------------------------
-- 7. Event state machine
--
-- calculated -> pending_approval -> approved -> paid, with voided reachable from
-- any unpaid state. Financial fields freeze once approved; paid and voided rows
-- are immutable, so corrections are adjustments or reversals.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_commission_event_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    or new.commission_plan_version_id is distinct from old.commission_plan_version_id;

  if old.status = 'approved' and financial_changed then
    raise exception
      'An approved commission event cannot be recalculated; void it or create an adjustment'
      using errcode = '42501';
  end if;

  -- Status transition table.
  transition_allowed :=
       (old.status = 'calculated' and new.status in ('calculated', 'pending_approval', 'voided'))
    or (old.status = 'pending_approval' and new.status in ('pending_approval', 'approved', 'voided'))
    or (old.status = 'approved' and new.status in ('approved', 'paid', 'voided'));

  if not transition_allowed then
    raise exception 'Commission event cannot move from % to %', old.status, new.status
      using errcode = '23514';
  end if;

  -- Trusted server context (service role or SQL editor) is not restricted further.
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
$$;

drop trigger if exists commission_events_enforce_rules on public.commission_events;
create trigger commission_events_enforce_rules
  before update on public.commission_events
  for each row
  execute function public.enforce_commission_event_rules();

-- ---------------------------------------------------------------------------
-- 8. Derived balances and attribution helpers
--
-- These are deliberately SECURITY INVOKER: Row Level Security decides which
-- ledger rows a caller may sum, so an employee reading their own balance sees
-- only their own entries.
-- ---------------------------------------------------------------------------

create or replace function public.employee_draw_balance(target_profile_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(l.amount), 0)::numeric(14,2)
  from public.employee_draw_ledger l
  where l.profile_id = target_profile_id
$$;

comment on function public.employee_draw_balance(uuid) is
  'Outstanding draw balance for an employee, derived from the append-only draw ledger. Signed convention: positive means the employee owes the advance back through future commission.';

create or replace function public.employee_rollover_balance(target_profile_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(sum(l.amount), 0)::numeric(14,2)
  from public.commission_rollover_ledger l
  where l.profile_id = target_profile_id
$$;

comment on function public.employee_rollover_balance(uuid) is
  'Outstanding negative-true-up rollover for an employee, derived from the append-only rollover ledger. Future commission absorbs this before anything becomes payable.';

create or replace function public.is_profile_on_draw_at(target_profile_id uuid, on_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.employee_draw_periods p
    where p.profile_id = target_profile_id
      and p.effective_from <= on_date
      and (p.effective_to is null or p.effective_to >= on_date)
  )
$$;

comment on function public.is_profile_on_draw_at(uuid, date) is
  'True when the employee was enrolled in draw against commission on that date. Used when calculating commission so the draw rate reduction is snapshotted per event.';

revoke all on function public.employee_draw_balance(uuid) from public;
revoke all on function public.employee_rollover_balance(uuid) from public;
revoke all on function public.is_profile_on_draw_at(uuid, date) from public;
revoke all on function public.guard_draw_ledger_balance() from public;
revoke all on function public.guard_rollover_ledger_balance() from public;
revoke all on function public.prevent_overlapping_draw_periods() from public;
revoke all on function public.enforce_commission_event_rules() from public;

grant execute on function public.employee_draw_balance(uuid) to authenticated;
grant execute on function public.employee_rollover_balance(uuid) to authenticated;
grant execute on function public.is_profile_on_draw_at(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Audit trail for events and ledgers
-- ---------------------------------------------------------------------------

create or replace function public.log_commission_event_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job',
      new.job_id,
      'commission_event_created',
      auth.uid(),
      jsonb_build_object(
        'commission_event_id', new.id,
        'profile_id', new.profile_id,
        'event_type', new.event_type,
        'calculation_stage', new.calculation_stage,
        'status', new.status,
        'commissionable_gp', new.commissionable_gp,
        'commissionable_gp_percent', new.commissionable_gp_percent,
        'standard_rate', new.standard_commission_rate,
        'draw_reduction', new.draw_rate_reduction,
        'effective_rate', new.effective_commission_rate,
        'gross_commission', new.gross_commission,
        'rollover_offset', new.rollover_offset,
        'draw_offset', new.draw_offset,
        'net_payable', new.net_payable
      )
    );
    return new;
  end if;

  insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
  values (
    'job',
    new.job_id,
    'commission_event_status_changed',
    auth.uid(),
    jsonb_build_object(
      'commission_event_id', new.id,
      'event_type', new.event_type,
      'from', old.status,
      'to', new.status,
      'net_payable', new.net_payable,
      'void_reason', new.void_reason,
      'voided_by', new.voided_by
    )
  );

  return new;
end;
$$;

drop trigger if exists commission_events_audit on public.commission_events;
create trigger commission_events_audit
  after insert or update on public.commission_events
  for each row
  execute function public.log_commission_event_audit();

create or replace function public.log_draw_ledger_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
  values (
    'profile',
    new.profile_id,
    'draw_ledger_entry_created',
    auth.uid(),
    jsonb_build_object(
      'ledger_entry_id', new.id,
      'transaction_type', new.transaction_type,
      'amount', new.amount,
      'job_id', new.job_id,
      'commission_event_id', new.commission_event_id,
      'reason', new.reason
    )
  );

  return new;
end;
$$;

drop trigger if exists employee_draw_ledger_audit on public.employee_draw_ledger;
create trigger employee_draw_ledger_audit
  after insert on public.employee_draw_ledger
  for each row
  execute function public.log_draw_ledger_audit();

create or replace function public.log_rollover_ledger_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
  values (
    'profile',
    new.profile_id,
    'rollover_ledger_entry_created',
    auth.uid(),
    jsonb_build_object(
      'ledger_entry_id', new.id,
      'transaction_type', new.transaction_type,
      'amount', new.amount,
      'job_id', new.job_id,
      'commission_event_id', new.commission_event_id,
      'reason', new.reason
    )
  );

  return new;
end;
$$;

drop trigger if exists commission_rollover_ledger_audit on public.commission_rollover_ledger;
create trigger commission_rollover_ledger_audit
  after insert on public.commission_rollover_ledger
  for each row
  execute function public.log_rollover_ledger_audit();

drop trigger if exists commission_settings_audit on public.commission_settings;
create trigger commission_settings_audit
  after insert or update on public.commission_settings
  for each row
  execute function public.log_config_audit_event('commission_settings');

drop trigger if exists employee_draw_periods_audit on public.employee_draw_periods;
create trigger employee_draw_periods_audit
  after insert or update on public.employee_draw_periods
  for each row
  execute function public.log_config_audit_event('employee_draw_period');

revoke all on function public.log_commission_event_audit() from public;
revoke all on function public.log_draw_ledger_audit() from public;
revoke all on function public.log_rollover_ledger_audit() from public;

-- ---------------------------------------------------------------------------
-- 10. Ledger → event references
--
-- Added after commission_events exists. `on delete set null` keeps the ledger
-- row (and therefore the money history) even if the referenced event row is
-- removed by a cascade, which only a trusted server context can do.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_draw_ledger_commission_event_id_fkey'
      and conrelid = 'public.employee_draw_ledger'::regclass
  ) then
    alter table public.employee_draw_ledger
      add constraint employee_draw_ledger_commission_event_id_fkey
      foreign key (commission_event_id) references public.commission_events (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_rollover_ledger_commission_event_id_fkey'
      and conrelid = 'public.commission_rollover_ledger'::regclass
  ) then
    alter table public.commission_rollover_ledger
      add constraint commission_rollover_ledger_commission_event_id_fkey
      foreign key (commission_event_id) references public.commission_events (id)
      on delete set null;
  end if;
end;
$$;
