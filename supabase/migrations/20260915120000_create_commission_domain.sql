-- Cabinet Genies Portal — Phase 2
-- Commission domain: project categories, commission plans, effective-dated plan
-- versions, commission tiers, employee commission settings/assignments, jobs,
-- financial adjustments and a structured audit log.
--
-- Conventions
--   * uuid primary keys (gen_random_uuid()).
--   * money          -> numeric(14,2)   (never floating point)
--   * rates/percent  -> numeric(9,6)    stored as decimals: 0.360000 = 36%
--   * every table carries created_at / updated_at maintained by set_updated_at()
--
-- This migration creates structure only. It contains no payout math: commission
-- dollars are Phase 3.
--
-- Apply with the Supabase SQL editor, or `supabase db push` once the CLI is
-- linked. The script is idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Authorization helpers
--
-- SECURITY DEFINER so that policies on public.profiles / public.jobs can consult
-- role information without recursing into their own policies.
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_role_is(variadic allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = any (allowed_roles), false)
$$;

revoke all on function public.current_profile_role_is(text[]) from public;
grant execute on function public.current_profile_role_is(text[]) to authenticated;

comment on function public.current_profile_role_is(text[]) is
  'True when the signed-in profile holds one of the supplied roles. Used by RLS policies; returns false for anonymous or inactive users.';

-- ---------------------------------------------------------------------------
-- 2. Project categories (configurable reference data)
--
-- Categories are database records, never hardcoded logic. Each category carries
-- its own minimum GP standard, which is what makes threshold_type =
-- 'project_minimum' possible on a commission tier.
-- ---------------------------------------------------------------------------

create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  active boolean not null default true,
  minimum_gp_standard numeric(9,6) not null default 0.360000,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_categories_name_not_blank check (btrim(name) <> ''),
  constraint project_categories_code_not_blank check (btrim(code) <> ''),
  constraint project_categories_minimum_gp_standard_range
    check (minimum_gp_standard >= 0 and minimum_gp_standard <= 1)
);

comment on table public.project_categories is
  'Configurable project categories (Kitchen, Bathroom, Closet, Outdoor, Other, Appliance, ...). Categories are data, not code: calculation logic must read them from here.';
comment on column public.project_categories.minimum_gp_standard is
  'Decimal percentage, e.g. 0.360000 = 36%. Serves as the reference point for commission tiers whose threshold type is project_minimum.';

create unique index if not exists project_categories_code_key
  on public.project_categories (upper(code));
create index if not exists project_categories_active_sort_idx
  on public.project_categories (active, sort_order, name);

drop trigger if exists project_categories_set_updated_at on public.project_categories;
create trigger project_categories_set_updated_at
  before update on public.project_categories
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Commission plans
-- ---------------------------------------------------------------------------

create table if not exists public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  plan_type text not null default 'straight_gp',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_plans_name_not_blank check (btrim(name) <> ''),
  constraint commission_plans_plan_type_supported check (plan_type in ('straight_gp'))
);

comment on table public.commission_plans is
  'A commission plan is a named, versioned set of rules. Editing a plan means creating a new version; existing versions are never rewritten.';
comment on column public.commission_plans.plan_type is
  'Which algorithm interprets the plan versions. Only straight_gp exists today; extend this constraint together with the implementation when a new plan type is added.';

create unique index if not exists commission_plans_name_key
  on public.commission_plans (lower(name));

drop trigger if exists commission_plans_set_updated_at on public.commission_plans;
create trigger commission_plans_set_updated_at
  before update on public.commission_plans
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Commission plan versions (effective-dated, historical)
-- ---------------------------------------------------------------------------

create table if not exists public.commission_plan_versions (
  id uuid primary key default gen_random_uuid(),
  commission_plan_id uuid not null references public.commission_plans (id) on delete cascade,
  version_name text not null,
  effective_from date not null,
  effective_to date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_plan_versions_name_not_blank check (btrim(version_name) <> ''),
  constraint commission_plan_versions_effective_range
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.commission_plan_versions is
  'Effective-dated version of a commission plan. Effective dates are inclusive on both ends. Historical rows are retained forever and are never edited in place once a job has been sold against them.';

create unique index if not exists commission_plan_versions_name_key
  on public.commission_plan_versions (commission_plan_id, lower(version_name));
create index if not exists commission_plan_versions_effective_idx
  on public.commission_plan_versions (commission_plan_id, effective_from desc);

-- Two active versions of the same plan may not cover the same day, otherwise
-- "the version effective on the sold date" would be ambiguous.
create or replace function public.prevent_overlapping_plan_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active is not true then
    return new;
  end if;

  if exists (
    select 1
    from public.commission_plan_versions v
    where v.commission_plan_id = new.commission_plan_id
      and v.active
      and v.id <> new.id
      and new.effective_from <= coalesce(v.effective_to, 'infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= v.effective_from
  ) then
    raise exception
      'Active commission plan versions cannot overlap for the same plan (%)', new.version_name
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists commission_plan_versions_prevent_overlap on public.commission_plan_versions;
create trigger commission_plan_versions_prevent_overlap
  before insert or update on public.commission_plan_versions
  for each row
  execute function public.prevent_overlapping_plan_versions();

drop trigger if exists commission_plan_versions_set_updated_at on public.commission_plan_versions;
create trigger commission_plan_versions_set_updated_at
  before update on public.commission_plan_versions
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Commission tiers
--
-- A tier is a band of gross-profit percentage with a commission rate. Bands may
-- be absolute (threshold_type = 'fixed') or relative to the project category's
-- minimum GP standard (threshold_type = 'project_minimum'), which is what lets a
-- top tier read "at or above the project's minimum GP standard" without
-- hardcoding a number per category.
--
-- For 'project_minimum', the numeric column holds an *offset* in decimal GP
-- points from the category minimum: null or 0 = exactly the category minimum,
-- 0.020000 = two points above it.
-- ---------------------------------------------------------------------------

create table if not exists public.commission_tiers (
  id uuid primary key default gen_random_uuid(),
  commission_plan_version_id uuid not null
    references public.commission_plan_versions (id) on delete cascade,
  sort_order integer not null default 0,
  lower_gp_percent numeric(9,6),
  lower_threshold_type text not null default 'fixed',
  upper_gp_percent numeric(9,6),
  upper_threshold_type text not null default 'fixed',
  rate numeric(9,6) not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_tiers_lower_threshold_type_supported
    check (lower_threshold_type in ('fixed', 'project_minimum')),
  constraint commission_tiers_upper_threshold_type_supported
    check (upper_threshold_type in ('fixed', 'project_minimum')),
  constraint commission_tiers_rate_range check (rate >= 0 and rate <= 1),
  constraint commission_tiers_lower_fixed_range
    check (lower_threshold_type <> 'fixed' or lower_gp_percent is null
           or (lower_gp_percent >= -1 and lower_gp_percent <= 1)),
  constraint commission_tiers_upper_fixed_range
    check (upper_threshold_type <> 'fixed' or upper_gp_percent is null
           or (upper_gp_percent >= -1 and upper_gp_percent <= 1)),
  constraint commission_tiers_lower_project_minimum_offset
    check (lower_threshold_type <> 'project_minimum' or lower_gp_percent is null
           or (lower_gp_percent >= -0.5 and lower_gp_percent <= 0.5)),
  constraint commission_tiers_upper_project_minimum_offset
    check (upper_threshold_type <> 'project_minimum' or upper_gp_percent is null
           or (upper_gp_percent >= -0.5 and upper_gp_percent <= 0.5)),
  constraint commission_tiers_fixed_ordering
    check (lower_threshold_type <> 'fixed' or upper_threshold_type <> 'fixed'
           or lower_gp_percent is null or upper_gp_percent is null
           or lower_gp_percent < upper_gp_percent)
);

comment on table public.commission_tiers is
  'Gross-profit bands and their commission rates, scoped to one plan version. Rates are decimals: 0.330000 = 33%. These tiers are configuration only — no payout math reads them yet.';
comment on column public.commission_tiers.sort_order is
  'Evaluation order, highest band first. Tiers are evaluated in this order; the first matching band wins.';
comment on column public.commission_tiers.lower_gp_percent is
  'Lower bound of the band. When the matching threshold type is project_minimum this value is an offset from the project category minimum (null/0 = exactly the minimum).';

create unique index if not exists commission_tiers_order_key
  on public.commission_tiers (commission_plan_version_id, sort_order);
create index if not exists commission_tiers_version_idx
  on public.commission_tiers (commission_plan_version_id, sort_order);

drop trigger if exists commission_tiers_set_updated_at on public.commission_tiers;
create trigger commission_tiers_set_updated_at
  before update on public.commission_tiers
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Employee commission eligibility and dated plan assignments
--
-- Eligibility lives in employee_commission_settings (one row per profile).
-- Plan membership lives in employee_commission_assignments, which is dated so a
-- person can change plans over time without erasing history.
-- ---------------------------------------------------------------------------

create table if not exists public.employee_commission_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  commission_eligible boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employee_commission_settings is
  'Per-profile commission eligibility. Financial history is never stored only on profiles — see employee_commission_assignments for dated plan membership.';

create unique index if not exists employee_commission_settings_profile_key
  on public.employee_commission_settings (profile_id);

drop trigger if exists employee_commission_settings_set_updated_at on public.employee_commission_settings;
create trigger employee_commission_settings_set_updated_at
  before update on public.employee_commission_settings
  for each row
  execute function public.set_updated_at();

create table if not exists public.employee_commission_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  commission_plan_id uuid not null references public.commission_plans (id) on delete restrict,
  effective_from date not null,
  effective_to date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_commission_assignments_effective_range
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.employee_commission_assignments is
  'Dated record of which commission plan an employee was on. Assignments are effective-dated so a plan change adds a row instead of overwriting history.';

create index if not exists employee_commission_assignments_profile_idx
  on public.employee_commission_assignments (profile_id, effective_from desc);
create index if not exists employee_commission_assignments_plan_idx
  on public.employee_commission_assignments (commission_plan_id);

create or replace function public.prevent_overlapping_employee_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.employee_commission_assignments a
    where a.profile_id = new.profile_id
      and a.id <> new.id
      and new.effective_from <= coalesce(a.effective_to, 'infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= a.effective_from
  ) then
    raise exception
      'Commission plan assignments cannot overlap for the same employee'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists employee_commission_assignments_prevent_overlap on public.employee_commission_assignments;
create trigger employee_commission_assignments_prevent_overlap
  before insert or update on public.employee_commission_assignments
  for each row
  execute function public.prevent_overlapping_employee_assignments();

drop trigger if exists employee_commission_assignments_set_updated_at on public.employee_commission_assignments;
create trigger employee_commission_assignments_set_updated_at
  before update on public.employee_commission_assignments
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Jobs
--
-- Column groups:
--   identity      job_number, job_name, customer_name, project_category_id
--   workflow      status, sales_designer_id, milestone dates
--   inputs        revenue and cost components entered by accounting
--   derived       actual_total_*, *_gross_profit, *_gp_percent
--   plan snapshot commission_plan_id, commission_plan_version_id
--
-- The derived columns are maintained by the application service layer from the
-- single canonical implementation in lib/commission/financials.ts. They are
-- deliberately not recomputed by a database trigger, so there is exactly one
-- calculation path in the system.
-- ---------------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text,
  job_name text not null,
  customer_name text,
  project_category_id uuid not null references public.project_categories (id) on delete restrict,
  status text not null default 'presale',
  sales_designer_id uuid references public.profiles (id) on delete set null,
  sold_date date,
  deposit_received_date date,
  completion_date date,
  gp_audit_completed_date date,

  contract_revenue numeric(14,2) not null default 0,
  change_order_revenue numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,
  other_revenue numeric(14,2) not null default 0,

  material_cost numeric(14,2) not null default 0,
  labor_cost numeric(14,2) not null default 0,
  subcontractor_cost numeric(14,2) not null default 0,
  other_direct_cost numeric(14,2) not null default 0,
  burden_cost numeric(14,2) not null default 0,
  warranty_service_contingency numeric(14,2) not null default 0,

  actual_total_revenue numeric(14,2) not null default 0,
  actual_total_cost numeric(14,2) not null default 0,
  job_gross_profit numeric(14,2) not null default 0,
  job_gp_percent numeric(9,6) not null default 0,

  commissionable_revenue numeric(14,2) not null default 0,
  commissionable_cost numeric(14,2) not null default 0,
  commissionable_gross_profit numeric(14,2) not null default 0,
  commissionable_gp_percent numeric(9,6) not null default 0,

  commission_plan_id uuid references public.commission_plans (id) on delete restrict,
  commission_plan_version_id uuid references public.commission_plan_versions (id) on delete restrict,

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jobs_job_name_not_blank check (btrim(job_name) <> ''),
  constraint jobs_job_number_not_blank check (job_number is null or btrim(job_number) <> ''),
  constraint jobs_status_supported check (
    status in (
      'presale',
      'sold',
      'active',
      'substantially_complete',
      'gp_audit_required',
      'gp_audited',
      'closed',
      'cancelled'
    )
  ),
  constraint jobs_contract_revenue_non_negative check (contract_revenue >= 0),
  constraint jobs_change_order_revenue_non_negative check (change_order_revenue >= 0),
  constraint jobs_credit_amount_non_negative check (credit_amount >= 0),
  constraint jobs_other_revenue_non_negative check (other_revenue >= 0),
  constraint jobs_material_cost_non_negative check (material_cost >= 0),
  constraint jobs_labor_cost_non_negative check (labor_cost >= 0),
  constraint jobs_subcontractor_cost_non_negative check (subcontractor_cost >= 0),
  constraint jobs_other_direct_cost_non_negative check (other_direct_cost >= 0),
  constraint jobs_burden_cost_non_negative check (burden_cost >= 0),
  constraint jobs_warranty_service_contingency_non_negative check (warranty_service_contingency >= 0)
);

comment on table public.jobs is
  'Jobs with their revenue/cost structure and the commission plan version that governs them. Job gross profit and commissionable gross profit are separate concepts; see the derived columns and lib/commission/financials.ts.';
comment on column public.jobs.status is
  'Workflow status. Extend this constraint when a new status is introduced.';
comment on column public.jobs.actual_total_revenue is
  'Derived: total job revenue including revenue adjustments. Written only by the application service layer.';
comment on column public.jobs.commissionable_revenue is
  'Derived: revenue that commissions are calculated against. Equals actual_total_revenue minus explicit exclusions recorded in job_financial_adjustments.';
comment on column public.jobs.commission_plan_version_id is
  'The plan version that governed the job when it was sold. Never re-resolved automatically; protected from edits once the job has a sold date.';

create unique index if not exists jobs_job_number_key
  on public.jobs (job_number)
  where job_number is not null;
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_project_category_idx on public.jobs (project_category_id);
create index if not exists jobs_sales_designer_idx on public.jobs (sales_designer_id);
create index if not exists jobs_sold_date_idx on public.jobs (sold_date desc);

-- The plan and the version must agree, and the version is required once a plan
-- is referenced.
create or replace function public.validate_job_plan_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commission_plan_version_id is null then
    if new.commission_plan_id is not null then
      raise exception
        'A job with a commission plan must also reference the plan version'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.commission_plan_id is null
    or not exists (
      select 1
      from public.commission_plan_versions v
      where v.id = new.commission_plan_version_id
        and v.commission_plan_id = new.commission_plan_id
    )
  then
    raise exception
      'commission_plan_version_id % does not belong to commission_plan_id %',
      new.commission_plan_version_id, new.commission_plan_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_validate_plan_reference on public.jobs;
create trigger jobs_validate_plan_reference
  before insert or update of commission_plan_id, commission_plan_version_id on public.jobs
  for each row
  execute function public.validate_job_plan_reference();

-- History protection: once a job is sold, only an administrator may repoint its
-- commission plan or version, and every change is audited.
create or replace function public.protect_sold_job_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sold_date is null then
    return new;
  end if;

  if new.commission_plan_id is distinct from old.commission_plan_id
    or new.commission_plan_version_id is distinct from old.commission_plan_version_id
  then
    if not public.current_profile_is_admin() then
      raise exception
        'The commission plan on a sold job can only be changed by an administrator'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_protect_sold_plan on public.jobs;
create trigger jobs_protect_sold_plan
  before update on public.jobs
  for each row
  execute function public.protect_sold_job_plan();

-- Column guard: accounting maintains the money and the audit milestones, but not
-- job identity, category, sales designer or plan assignment.
create or replace function public.enforce_job_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text := public.current_profile_role();
begin
  -- No signed-in profile means a trusted server context (service role or SQL
  -- editor), which is not restricted here.
  if actor_role is null or actor_role in ('admin', 'ceo') then
    return new;
  end if;

  if actor_role = 'accounting' then
    if new.job_number is distinct from old.job_number
      or new.job_name is distinct from old.job_name
      or new.customer_name is distinct from old.customer_name
      or new.project_category_id is distinct from old.project_category_id
      or new.sales_designer_id is distinct from old.sales_designer_id
      or new.sold_date is distinct from old.sold_date
      or new.commission_plan_id is distinct from old.commission_plan_id
      or new.commission_plan_version_id is distinct from old.commission_plan_version_id
      or new.created_by is distinct from old.created_by
    then
      raise exception
        'Accounting may update job financials, status and milestone dates, but not job identity, category, sales designer or commission plan'
        using errcode = '42501';
    end if;

    return new;
  end if;

  raise exception 'This role cannot update jobs' using errcode = '42501';
end;
$$;

drop trigger if exists jobs_enforce_update_permissions on public.jobs;
create trigger jobs_enforce_update_permissions
  before update on public.jobs
  for each row
  execute function public.enforce_job_update_permissions();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Job financial adjustments (append-only)
--
-- Adjustments are how the financial model stays honest over time:
--   revenue / cost                 -> adjust the job's totals
--   commissionable_revenue / cost  -> explicitly include/exclude amounts from the
--                                     commissionable base (negative = exclusion)
-- Corrections are new rows; existing rows are never edited.
-- ---------------------------------------------------------------------------

create table if not exists public.job_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  adjustment_type text not null,
  amount numeric(14,2) not null,
  reason text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint job_financial_adjustments_type_supported
    check (adjustment_type in ('revenue', 'cost', 'commissionable_revenue', 'commissionable_cost')),
  constraint job_financial_adjustments_reason_not_blank check (btrim(reason) <> '')
);

comment on table public.job_financial_adjustments is
  'Append-only financial adjustments. A correction is recorded as another adjustment row so the history of why a job changed is preserved.';

create index if not exists job_financial_adjustments_job_idx
  on public.job_financial_adjustments (job_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. Audit log (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_entity_type_not_blank check (btrim(entity_type) <> ''),
  constraint audit_events_action_not_blank check (btrim(action) <> '')
);

comment on table public.audit_events is
  'Structured, append-only audit trail. Written by SECURITY DEFINER triggers so the application cannot fabricate or rewrite history.';

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);
create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);

-- ---------------------------------------------------------------------------
-- 10. Append-only enforcement
-- ---------------------------------------------------------------------------

create or replace function public.reject_row_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Rows in %.% are append-only; record a correcting entry instead',
    tg_table_schema, tg_table_name
    using errcode = '42501';
end;
$$;

drop trigger if exists job_financial_adjustments_no_update on public.job_financial_adjustments;
create trigger job_financial_adjustments_no_update
  before update on public.job_financial_adjustments
  for each row
  execute function public.reject_row_mutation();

drop trigger if exists audit_events_no_update on public.audit_events;
create trigger audit_events_no_update
  before update on public.audit_events
  for each row
  execute function public.reject_row_mutation();

drop trigger if exists audit_events_no_delete on public.audit_events;
create trigger audit_events_no_delete
  before delete on public.audit_events
  for each row
  execute function public.reject_row_mutation();

revoke all on function public.reject_row_mutation() from public;
revoke all on function public.prevent_overlapping_plan_versions() from public;
revoke all on function public.prevent_overlapping_employee_assignments() from public;
revoke all on function public.validate_job_plan_reference() from public;
revoke all on function public.protect_sold_job_plan() from public;
revoke all on function public.enforce_job_update_permissions() from public;

-- ---------------------------------------------------------------------------
-- 11. Audit triggers
-- ---------------------------------------------------------------------------

create or replace function public.log_job_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  changed_columns text[] := array[]::text[];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job',
      new.id,
      'job_created',
      actor,
      jsonb_build_object(
        'job_number', new.job_number,
        'job_name', new.job_name,
        'customer_name', new.customer_name,
        'status', new.status,
        'project_category_id', new.project_category_id,
        'sales_designer_id', new.sales_designer_id
      )
    );
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job', new.id, 'job_status_changed', actor,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  if new.sales_designer_id is distinct from old.sales_designer_id then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job', new.id, 'sales_designer_changed', actor,
      jsonb_build_object('from', old.sales_designer_id, 'to', new.sales_designer_id)
    );
  end if;

  if new.project_category_id is distinct from old.project_category_id then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job', new.id, 'project_category_changed', actor,
      jsonb_build_object('from', old.project_category_id, 'to', new.project_category_id)
    );
  end if;

  if new.commission_plan_id is distinct from old.commission_plan_id
    or new.commission_plan_version_id is distinct from old.commission_plan_version_id
  then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job', new.id, 'commission_plan_assigned', actor,
      jsonb_build_object(
        'from_commission_plan_id', old.commission_plan_id,
        'to_commission_plan_id', new.commission_plan_id,
        'from_commission_plan_version_id', old.commission_plan_version_id,
        'to_commission_plan_version_id', new.commission_plan_version_id
      )
    );
  end if;

  if new.contract_revenue is distinct from old.contract_revenue then
    changed_columns := changed_columns || 'contract_revenue';
  end if;
  if new.change_order_revenue is distinct from old.change_order_revenue then
    changed_columns := changed_columns || 'change_order_revenue';
  end if;
  if new.credit_amount is distinct from old.credit_amount then
    changed_columns := changed_columns || 'credit_amount';
  end if;
  if new.other_revenue is distinct from old.other_revenue then
    changed_columns := changed_columns || 'other_revenue';
  end if;
  if new.material_cost is distinct from old.material_cost then
    changed_columns := changed_columns || 'material_cost';
  end if;
  if new.labor_cost is distinct from old.labor_cost then
    changed_columns := changed_columns || 'labor_cost';
  end if;
  if new.subcontractor_cost is distinct from old.subcontractor_cost then
    changed_columns := changed_columns || 'subcontractor_cost';
  end if;
  if new.other_direct_cost is distinct from old.other_direct_cost then
    changed_columns := changed_columns || 'other_direct_cost';
  end if;
  if new.burden_cost is distinct from old.burden_cost then
    changed_columns := changed_columns || 'burden_cost';
  end if;
  if new.warranty_service_contingency is distinct from old.warranty_service_contingency then
    changed_columns := changed_columns || 'warranty_service_contingency';
  end if;
  if new.actual_total_revenue is distinct from old.actual_total_revenue then
    changed_columns := changed_columns || 'actual_total_revenue';
  end if;
  if new.actual_total_cost is distinct from old.actual_total_cost then
    changed_columns := changed_columns || 'actual_total_cost';
  end if;
  if new.job_gross_profit is distinct from old.job_gross_profit then
    changed_columns := changed_columns || 'job_gross_profit';
  end if;
  if new.commissionable_gross_profit is distinct from old.commissionable_gross_profit then
    changed_columns := changed_columns || 'commissionable_gross_profit';
  end if;

  if array_length(changed_columns, 1) is not null then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job', new.id, 'job_financials_changed', actor,
      jsonb_build_object(
        'fields', to_jsonb(changed_columns),
        'from', jsonb_build_object(
          'actual_total_revenue', old.actual_total_revenue,
          'actual_total_cost', old.actual_total_cost,
          'job_gross_profit', old.job_gross_profit,
          'job_gp_percent', old.job_gp_percent,
          'commissionable_gross_profit', old.commissionable_gross_profit,
          'commissionable_gp_percent', old.commissionable_gp_percent
        ),
        'to', jsonb_build_object(
          'actual_total_revenue', new.actual_total_revenue,
          'actual_total_cost', new.actual_total_cost,
          'job_gross_profit', new.job_gross_profit,
          'job_gp_percent', new.job_gp_percent,
          'commissionable_gross_profit', new.commissionable_gross_profit,
          'commissionable_gp_percent', new.commissionable_gp_percent
        )
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_audit_changes on public.jobs;
create trigger jobs_audit_changes
  after insert or update on public.jobs
  for each row
  execute function public.log_job_audit_event();

create or replace function public.log_job_adjustment_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
  values (
    'job',
    new.job_id,
    'financial_adjustment_created',
    auth.uid(),
    jsonb_build_object(
      'adjustment_id', new.id,
      'adjustment_type', new.adjustment_type,
      'amount', new.amount,
      'reason', new.reason,
      'created_by', new.created_by
    )
  );

  return new;
end;
$$;

drop trigger if exists job_financial_adjustments_audit on public.job_financial_adjustments;
create trigger job_financial_adjustments_audit
  after insert on public.job_financial_adjustments
  for each row
  execute function public.log_job_adjustment_audit_event();

-- Generic configuration audit. The entity type is passed as a trigger argument,
-- so new configuration tables only need one trigger to join the audit trail.
create or replace function public.log_config_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  entity_type text := tg_argv[0];
  before_row jsonb;
  after_row jsonb;
  changed jsonb := '{}'::jsonb;
  column_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      entity_type, new.id, entity_type || '_created', actor,
      jsonb_build_object('after', to_jsonb(new) - 'created_at' - 'updated_at')
    );
    return new;
  end if;

  before_row := to_jsonb(old);
  after_row := to_jsonb(new) - 'created_at' - 'updated_at';
  before_row := before_row - 'created_at' - 'updated_at';

  for column_name in select jsonb_object_keys(after_row)
  loop
    if (before_row -> column_name) is distinct from (after_row -> column_name) then
      changed := changed || jsonb_build_object(
        column_name,
        jsonb_build_object('from', before_row -> column_name, 'to', after_row -> column_name)
      );
    end if;
  end loop;

  if changed <> '{}'::jsonb then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (entity_type, new.id, entity_type || '_updated', actor, changed);
  end if;

  return new;
end;
$$;

drop trigger if exists project_categories_audit on public.project_categories;
create trigger project_categories_audit
  after insert or update on public.project_categories
  for each row
  execute function public.log_config_audit_event('project_category');

drop trigger if exists commission_plans_audit on public.commission_plans;
create trigger commission_plans_audit
  after insert or update on public.commission_plans
  for each row
  execute function public.log_config_audit_event('commission_plan');

drop trigger if exists commission_plan_versions_audit on public.commission_plan_versions;
create trigger commission_plan_versions_audit
  after insert or update on public.commission_plan_versions
  for each row
  execute function public.log_config_audit_event('commission_plan_version');

drop trigger if exists commission_tiers_audit on public.commission_tiers;
create trigger commission_tiers_audit
  after insert or update on public.commission_tiers
  for each row
  execute function public.log_config_audit_event('commission_tier');

drop trigger if exists employee_commission_settings_audit on public.employee_commission_settings;
create trigger employee_commission_settings_audit
  after insert or update on public.employee_commission_settings
  for each row
  execute function public.log_config_audit_event('employee_commission_settings');

drop trigger if exists employee_commission_assignments_audit on public.employee_commission_assignments;
create trigger employee_commission_assignments_audit
  after insert or update on public.employee_commission_assignments
  for each row
  execute function public.log_config_audit_event('employee_commission_assignment');
