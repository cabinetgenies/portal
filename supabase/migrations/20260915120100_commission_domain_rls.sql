-- Cabinet Genies Portal — Phase 2
-- Row Level Security for the commission domain.
--
-- Policy intent (Phase 2)
--   employee    : read jobs where they are the sales designer. No financial edits.
--   supervisor  : read jobs assigned to them or their direct reports. No financial edits.
--   accounting  : read every job and all financial data, edit financial fields,
--                 create financial adjustments. Configuration is read-only.
--   admin / ceo : full access, including commission configuration.
--
-- Read access to commission *rules* (plans, versions, tiers, employee settings
-- and assignments) is limited to accounting/admin/ceo. Project categories are
-- reference data used to label jobs, so any authenticated portal user may read
-- them; the GP standard they carry is used for display and configuration, and
-- the rates themselves are never exposed to employees.
--
-- UI hiding is never the control: every policy below is enforced by Postgres,
-- and the Server Actions in lib/commission/actions.ts re-check capability before
-- writing.

-- ---------------------------------------------------------------------------
-- 1. Profiles: accounting may read the user directory
--
-- Accounting has to show who the sales designer is on every job. Phase 1 did not
-- grant this; Phase 2 does, explicitly and narrowly (read only, no writes).
-- ---------------------------------------------------------------------------

drop policy if exists "Profiles are viewable by accounting" on public.profiles;
create policy "Profiles are viewable by accounting"
  on public.profiles
  for select
  to authenticated
  using (public.current_profile_role_is('accounting'));

-- ---------------------------------------------------------------------------
-- 2. Project categories
-- ---------------------------------------------------------------------------

alter table public.project_categories enable row level security;

revoke all on table public.project_categories from anon;
grant select, insert, update, delete on table public.project_categories to authenticated;

drop policy if exists "Project categories are readable by portal users" on public.project_categories;
create policy "Project categories are readable by portal users"
  on public.project_categories
  for select
  to authenticated
  using (true);

drop policy if exists "Project categories are managed by administrators" on public.project_categories;
create policy "Project categories are managed by administrators"
  on public.project_categories
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 3. Commission plans, versions and tiers (compensation configuration)
-- ---------------------------------------------------------------------------

alter table public.commission_plans enable row level security;
revoke all on table public.commission_plans from anon;
grant select, insert, update, delete on table public.commission_plans to authenticated;

drop policy if exists "Commission plans are readable by finance and administrators" on public.commission_plans;
create policy "Commission plans are readable by finance and administrators"
  on public.commission_plans
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Commission plans are managed by administrators" on public.commission_plans;
create policy "Commission plans are managed by administrators"
  on public.commission_plans
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.commission_plan_versions enable row level security;
revoke all on table public.commission_plan_versions from anon;
grant select, insert, update, delete on table public.commission_plan_versions to authenticated;

drop policy if exists "Commission plan versions are readable by finance and administrators" on public.commission_plan_versions;
create policy "Commission plan versions are readable by finance and administrators"
  on public.commission_plan_versions
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Commission plan versions are managed by administrators" on public.commission_plan_versions;
create policy "Commission plan versions are managed by administrators"
  on public.commission_plan_versions
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.commission_tiers enable row level security;
revoke all on table public.commission_tiers from anon;
grant select, insert, update, delete on table public.commission_tiers to authenticated;

drop policy if exists "Commission tiers are readable by finance and administrators" on public.commission_tiers;
create policy "Commission tiers are readable by finance and administrators"
  on public.commission_tiers
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Commission tiers are managed by administrators" on public.commission_tiers;
create policy "Commission tiers are managed by administrators"
  on public.commission_tiers
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 4. Employee commission settings and dated assignments
-- ---------------------------------------------------------------------------

alter table public.employee_commission_settings enable row level security;
revoke all on table public.employee_commission_settings from anon;
grant select, insert, update, delete on table public.employee_commission_settings to authenticated;

drop policy if exists "Employee commission settings are readable by finance and administrators" on public.employee_commission_settings;
create policy "Employee commission settings are readable by finance and administrators"
  on public.employee_commission_settings
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Employee commission settings are managed by administrators" on public.employee_commission_settings;
create policy "Employee commission settings are managed by administrators"
  on public.employee_commission_settings
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.employee_commission_assignments enable row level security;
revoke all on table public.employee_commission_assignments from anon;
grant select, insert, update, delete on table public.employee_commission_assignments to authenticated;

drop policy if exists "Employee commission assignments are readable by finance and administrators" on public.employee_commission_assignments;
create policy "Employee commission assignments are readable by finance and administrators"
  on public.employee_commission_assignments
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Employee commission assignments are managed by administrators" on public.employee_commission_assignments;
create policy "Employee commission assignments are managed by administrators"
  on public.employee_commission_assignments
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and (created_by is null or created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. Jobs
-- ---------------------------------------------------------------------------

alter table public.jobs enable row level security;

revoke all on table public.jobs from anon;
grant select, insert, update on table public.jobs to authenticated;
-- No DELETE grant and no DELETE policy: jobs are cancelled, never deleted, so the
-- audit trail and commission history stay intact.

drop policy if exists "Jobs are readable by their sales designer" on public.jobs;
create policy "Jobs are readable by their sales designer"
  on public.jobs
  for select
  to authenticated
  using (sales_designer_id = auth.uid());

drop policy if exists "Jobs are readable by the sales designer's manager" on public.jobs;
create policy "Jobs are readable by the sales designer's manager"
  on public.jobs
  for select
  to authenticated
  using (public.manages_profile(sales_designer_id));

drop policy if exists "Jobs are readable by accounting and administrators" on public.jobs;
create policy "Jobs are readable by accounting and administrators"
  on public.jobs
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Jobs are created by administrators" on public.jobs;
create policy "Jobs are created by administrators"
  on public.jobs
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and created_by = auth.uid()
  );

drop policy if exists "Jobs are updated by accounting and administrators" on public.jobs;
create policy "Jobs are updated by accounting and administrators"
  on public.jobs
  for update
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'))
  with check (public.current_profile_role_is('accounting', 'admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 6. Job financial adjustments
-- ---------------------------------------------------------------------------

alter table public.job_financial_adjustments enable row level security;

revoke all on table public.job_financial_adjustments from anon;
grant select, insert on table public.job_financial_adjustments to authenticated;
-- No UPDATE grant and no UPDATE policy: the table is append-only (also enforced
-- by the no_update trigger). Corrections are new rows.

drop policy if exists "Job adjustments are readable by finance and administrators" on public.job_financial_adjustments;
create policy "Job adjustments are readable by finance and administrators"
  on public.job_financial_adjustments
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Job adjustments are created by finance and administrators" on public.job_financial_adjustments;
create policy "Job adjustments are created by finance and administrators"
  on public.job_financial_adjustments
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('accounting', 'admin', 'ceo')
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 7. Audit log
-- ---------------------------------------------------------------------------

alter table public.audit_events enable row level security;

revoke all on table public.audit_events from anon;
grant select on table public.audit_events to authenticated;
-- No INSERT policy: audit rows are written only by SECURITY DEFINER triggers, so
-- the application cannot forge history. No UPDATE/DELETE policy either, and the
-- append-only triggers block them outright.

drop policy if exists "Audit events are readable by finance and administrators" on public.audit_events;
create policy "Audit events are readable by finance and administrators"
  on public.audit_events
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));
