-- Cabinet Genies Portal — Phase 3 preparation
-- Generalise the compensation domain so Sales Manager compensation can be added
-- later without rewriting Sales Designer commission history.
--
-- Why this migration exists
--   Phase 2 named the shared rule tables as if every compensation rule had to be
--   a Sales Designer commission ("commission_plans", "employee_commission_*").
--   Cabinet Genies gives each job exactly one primary Sales Designer, never a
--   split commission, and will later pay a Sales Manager a *separate* bonus or
--   override on qualifying jobs produced by their team. The shared structures are
--   therefore renamed to compensation terminology, and a participant kind says
--   who a plan compensates.
--
-- What this migration does NOT do
--   * No Sales Manager bonus calculation, approval, payment or reporting exists.
--   * No commission splits are introduced. A job still has exactly one
--     sales_designer_id, and a job may only reference a *sales designer* plan.
--   * No manager compensation is modelled as a share of a designer's commission.
--
-- Ordering note: 20260915120200_seed_sen_straight_gp_example.sql runs *before*
-- this file and therefore still uses the Phase 2 names. The rename below carries
-- those rows across unchanged.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Rename the shared rule and assignment tables
-- ---------------------------------------------------------------------------

do $$
declare
  pair record;
begin
  for pair in
    select *
    from (
      values
        ('commission_plans', 'compensation_plans'),
        ('commission_plan_versions', 'compensation_plan_versions'),
        ('commission_tiers', 'compensation_plan_tiers'),
        ('employee_commission_settings', 'employee_compensation_settings'),
        ('employee_commission_assignments', 'employee_compensation_assignments')
    ) as rename_map(old_name, new_name)
  loop
    if to_regclass('public.' || pair.old_name) is not null
      and to_regclass('public.' || pair.new_name) is null
    then
      execute format(
        'alter table public.%I rename to %I',
        pair.old_name,
        pair.new_name
      );
      raise notice 'Renamed public.% to public.%', pair.old_name, pair.new_name;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rename the columns that named a shared concept after one participant
-- ---------------------------------------------------------------------------

do $$
declare
  rename_map record;
begin
  for rename_map in
    select *
    from (
      values
        ('jobs', 'commission_plan_id', 'compensation_plan_id'),
        ('jobs', 'commission_plan_version_id', 'compensation_plan_version_id'),
        ('compensation_plan_versions', 'commission_plan_id', 'compensation_plan_id'),
        ('compensation_plan_tiers', 'commission_plan_version_id', 'compensation_plan_version_id'),
        ('employee_compensation_assignments', 'commission_plan_id', 'compensation_plan_id'),
        ('employee_compensation_settings', 'commission_eligible', 'compensation_eligible')
    ) as column_map(table_name, old_name, new_name)
  loop
    if exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = rename_map.table_name
          and c.column_name = rename_map.old_name
      )
      and not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = rename_map.table_name
          and c.column_name = rename_map.new_name
      )
    then
      execute format(
        'alter table public.%I rename column %I to %I',
        rename_map.table_name,
        rename_map.old_name,
        rename_map.new_name
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rename the indexes that carry the old vocabulary
--
-- Constraint names from Phase 2 (for example commission_tiers_rate_range) are
-- left alone: they are cosmetic, cannot be referenced by application code, and
-- renaming them adds risk without changing behaviour.
-- ---------------------------------------------------------------------------

do $$
declare
  rename_map record;
begin
  for rename_map in
    select *
    from (
      values
        ('commission_plans_name_key', 'compensation_plans_name_key'),
        ('commission_plan_versions_name_key', 'compensation_plan_versions_name_key'),
        ('commission_plan_versions_effective_idx', 'compensation_plan_versions_effective_idx'),
        ('commission_tiers_order_key', 'compensation_plan_tiers_order_key'),
        ('commission_tiers_version_idx', 'compensation_plan_tiers_version_idx'),
        ('employee_commission_settings_profile_key', 'employee_compensation_settings_profile_key'),
        ('employee_commission_assignments_profile_idx', 'employee_compensation_assignments_profile_idx'),
        ('employee_commission_assignments_plan_idx', 'employee_compensation_assignments_plan_idx')
    ) as index_map(old_name, new_name)
  loop
    if to_regclass('public.' || rename_map.old_name) is not null
      and to_regclass('public.' || rename_map.new_name) is null
    then
      execute format(
        'alter index public.%I rename to %I',
        rename_map.old_name,
        rename_map.new_name
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Participant kind: who a compensation plan compensates
--
--   sales_designer : implemented today. Jobs reference plans of this kind.
--   sales_manager  : reserved. The vocabulary exists so manager plans can be
--                    configured later without touching designer history, but no
--                    manager bonus is calculated, approved or paid in this phase,
--                    and a job may never reference a manager plan.
-- ---------------------------------------------------------------------------

alter table public.compensation_plans
  add column if not exists participant_kind text not null default 'sales_designer';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'compensation_plans_participant_kind_supported'
      and conrelid = 'public.compensation_plans'::regclass
  ) then
    alter table public.compensation_plans
      add constraint compensation_plans_participant_kind_supported
      check (participant_kind in ('sales_designer', 'sales_manager'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Replace the functions whose bodies referenced the renamed columns
-- ---------------------------------------------------------------------------

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
    from public.compensation_plan_versions v
    where v.compensation_plan_id = new.compensation_plan_id
      and v.active
      and v.id <> new.id
      and new.effective_from <= coalesce(v.effective_to, 'infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= v.effective_from
  ) then
    raise exception
      'Active compensation plan versions cannot overlap for the same plan (%)', new.version_name
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_overlapping_employee_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.employee_compensation_assignments a
    where a.profile_id = new.profile_id
      and a.id <> new.id
      and new.effective_from <= coalesce(a.effective_to, 'infinity'::date)
      and coalesce(new.effective_to, 'infinity'::date) >= a.effective_from
  ) then
    raise exception
      'Compensation plan assignments cannot overlap for the same employee'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

-- Job plan reference + participant guard.
--
-- A job carries the plan that governs its Sales Designer. Manager compensation is
-- attributed to qualifying jobs *outside* this column, so a manager plan can
-- never be attached to a job as if it were an ownership share of the designer's
-- commission.
create or replace function public.validate_job_plan_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.compensation_plan_version_id is null then
    if new.compensation_plan_id is not null then
      raise exception
        'A job with a compensation plan must also reference the plan version'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.compensation_plan_id is null
    or not exists (
      select 1
      from public.compensation_plan_versions v
      where v.id = new.compensation_plan_version_id
        and v.compensation_plan_id = new.compensation_plan_id
    )
  then
    raise exception
      'compensation_plan_version_id % does not belong to compensation_plan_id %',
      new.compensation_plan_version_id, new.compensation_plan_id
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.compensation_plans p
    where p.id = new.compensation_plan_id
      and p.participant_kind = 'sales_designer'
  ) then
    raise exception
      'A job can only reference a sales designer compensation plan'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_validate_plan_reference on public.jobs;
create trigger jobs_validate_plan_reference
  before insert or update of compensation_plan_id, compensation_plan_version_id on public.jobs
  for each row
  execute function public.validate_job_plan_reference();

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

  if new.compensation_plan_id is distinct from old.compensation_plan_id
    or new.compensation_plan_version_id is distinct from old.compensation_plan_version_id
  then
    if not public.current_profile_is_admin() then
      raise exception
        'The compensation plan on a sold job can only be changed by an administrator'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

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
      or new.compensation_plan_id is distinct from old.compensation_plan_id
      or new.compensation_plan_version_id is distinct from old.compensation_plan_version_id
      or new.created_by is distinct from old.created_by
    then
      raise exception
        'Accounting may update job financials, status and milestone dates, but not job identity, category, sales designer or compensation plan'
        using errcode = '42501';
    end if;

    return new;
  end if;

  raise exception 'This role cannot update jobs' using errcode = '42501';
end;
$$;

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

  if new.compensation_plan_id is distinct from old.compensation_plan_id
    or new.compensation_plan_version_id is distinct from old.compensation_plan_version_id
  then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'job', new.id, 'compensation_plan_assigned', actor,
      jsonb_build_object(
        'from_compensation_plan_id', old.compensation_plan_id,
        'to_compensation_plan_id', new.compensation_plan_id,
        'from_compensation_plan_version_id', old.compensation_plan_version_id,
        'to_compensation_plan_version_id', new.compensation_plan_version_id
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

-- ---------------------------------------------------------------------------
-- 6. Configuration audit triggers: neutral entity types
--
-- Rows written before this migration keep their original entity_type
-- ('commission_plan', 'commission_tier', ...). Job audit events, which are the
-- only ones surfaced in the portal today, are unaffected.
-- ---------------------------------------------------------------------------

drop trigger if exists commission_plans_audit on public.compensation_plans;
create trigger compensation_plans_audit
  after insert or update on public.compensation_plans
  for each row
  execute function public.log_config_audit_event('compensation_plan');

drop trigger if exists commission_plan_versions_audit on public.compensation_plan_versions;
create trigger compensation_plan_versions_audit
  after insert or update on public.compensation_plan_versions
  for each row
  execute function public.log_config_audit_event('compensation_plan_version');

drop trigger if exists commission_tiers_audit on public.compensation_plan_tiers;
create trigger compensation_plan_tiers_audit
  after insert or update on public.compensation_plan_tiers
  for each row
  execute function public.log_config_audit_event('compensation_plan_tier');

drop trigger if exists employee_commission_settings_audit on public.employee_compensation_settings;
create trigger employee_compensation_settings_audit
  after insert or update on public.employee_compensation_settings
  for each row
  execute function public.log_config_audit_event('employee_compensation_settings');

drop trigger if exists employee_commission_assignments_audit on public.employee_compensation_assignments;
create trigger employee_compensation_assignments_audit
  after insert or update on public.employee_compensation_assignments
  for each row
  execute function public.log_config_audit_event('employee_compensation_assignment');

-- ---------------------------------------------------------------------------
-- 7. Row Level Security: neutral policy names
--
-- Policies follow their table rename automatically; only the names still carry
-- the old vocabulary. Access rules are unchanged from Phase 2.
-- ---------------------------------------------------------------------------

drop policy if exists "Commission plans are readable by finance and administrators" on public.compensation_plans;
drop policy if exists "Commission plans are managed by administrators" on public.compensation_plans;
create policy "Compensation plans are readable by finance and administrators"
  on public.compensation_plans
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));
create policy "Compensation plans are managed by administrators"
  on public.compensation_plans
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

drop policy if exists "Commission plan versions are readable by finance and administrators" on public.compensation_plan_versions;
drop policy if exists "Commission plan versions are managed by administrators" on public.compensation_plan_versions;
create policy "Compensation plan versions are readable by finance and administrators"
  on public.compensation_plan_versions
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));
create policy "Compensation plan versions are managed by administrators"
  on public.compensation_plan_versions
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

drop policy if exists "Commission tiers are readable by finance and administrators" on public.compensation_plan_tiers;
drop policy if exists "Commission tiers are managed by administrators" on public.compensation_plan_tiers;
create policy "Compensation plan tiers are readable by finance and administrators"
  on public.compensation_plan_tiers
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));
create policy "Compensation plan tiers are managed by administrators"
  on public.compensation_plan_tiers
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

drop policy if exists "Employee commission settings are readable by finance and administrators" on public.employee_compensation_settings;
drop policy if exists "Employee commission settings are managed by administrators" on public.employee_compensation_settings;
create policy "Employee compensation settings are readable by finance and administrators"
  on public.employee_compensation_settings
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));
create policy "Employee compensation settings are managed by administrators"
  on public.employee_compensation_settings
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

drop policy if exists "Employee commission assignments are readable by finance and administrators" on public.employee_compensation_assignments;
drop policy if exists "Employee commission assignments are managed by administrators" on public.employee_compensation_assignments;
create policy "Employee compensation assignments are readable by finance and administrators"
  on public.employee_compensation_assignments
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));
create policy "Employee compensation assignments are managed by administrators"
  on public.employee_compensation_assignments
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and (created_by is null or created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 8. Documentation of the invariants, on the objects themselves
-- ---------------------------------------------------------------------------

comment on table public.compensation_plans is
  'A compensation plan is a named, versioned set of rules for one participant. Today every active plan compensates a sales designer; the same structure carries future sales manager bonus/override plans (participant_kind = sales_manager). Editing a plan means adding a version — existing versions are never rewritten.';
comment on column public.compensation_plans.participant_kind is
  'Who the plan compensates: sales_designer (implemented) or sales_manager (reserved). A manager plan is never attached to a job and is never a share of a designer''s commission.';
comment on table public.compensation_plan_tiers is
  'Gross-profit bands and their rate, scoped to one plan version. A rate is the participant''s own rate for that band — never a percentage ownership of another person''s compensation.';
comment on table public.employee_compensation_settings is
  'Per-profile compensation eligibility. Financial history is never stored only on profiles.';
comment on column public.employee_compensation_settings.compensation_eligible is
  'Whether this person participates in any compensation plan. Eligibility alone never sets a rate.';
comment on table public.employee_compensation_assignments is
  'Dated record of which compensation plan an employee was on. Assignment history is append-by-period so a plan change never rewrites the past.';
comment on column public.jobs.sales_designer_id is
  'The single primary sales designer for this job. Cabinet Genies does not split commissions, so there is deliberately no split/ownership table.';
comment on column public.jobs.compensation_plan_id is
  'The sales designer compensation plan that governs this job. Manager compensation is attributed to qualifying jobs separately and is never stored here.';
comment on column public.jobs.compensation_plan_version_id is
  'The plan version that governed the job when it was sold. Never re-resolved automatically; protected from edits once the job has a sold date.';
