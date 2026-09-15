-- Cabinet Genies Portal — Phase 3
-- Row Level Security for the commission engine.
--
-- Access intent
--   employee   : their own commission events, draw periods, draw ledger and
--                rollover ledger. Nothing else.
--   supervisor : the above for themselves and their direct reports.
--   accounting : read every commission financial record; calculate/recalculate and
--                submit events for approval. No approval, payment or voiding.
--   admin/ceo  : full access, including rule configuration, draw management and the
--                approval/payment workflow.
--
-- UI hiding is never the control: these policies are enforced by Postgres, and the
-- Server Actions in lib/commission/*.ts re-check capability before writing.

-- ---------------------------------------------------------------------------
-- 1. Commission settings (rule inputs)
-- ---------------------------------------------------------------------------

alter table public.commission_settings enable row level security;

revoke all on table public.commission_settings from anon;
grant select, insert, update, delete on table public.commission_settings to authenticated;

drop policy if exists "Commission settings are readable by finance and administrators" on public.commission_settings;
create policy "Commission settings are readable by finance and administrators"
  on public.commission_settings
  for select
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'));

drop policy if exists "Commission settings are managed by administrators" on public.commission_settings;
create policy "Commission settings are managed by administrators"
  on public.commission_settings
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 2. Draw enrollment periods
-- ---------------------------------------------------------------------------

alter table public.employee_draw_periods enable row level security;

revoke all on table public.employee_draw_periods from anon;
grant select, insert, update, delete on table public.employee_draw_periods to authenticated;

drop policy if exists "Draw periods are readable by the employee, their manager, finance and administrators" on public.employee_draw_periods;
create policy "Draw periods are readable by the employee, their manager, finance and administrators"
  on public.employee_draw_periods
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.manages_profile(profile_id)
    or public.current_profile_role_is('accounting', 'admin', 'ceo')
  );

drop policy if exists "Draw periods are managed by administrators" on public.employee_draw_periods;
create policy "Draw periods are managed by administrators"
  on public.employee_draw_periods
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and (created_by is null or created_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. Draw ledger
--
-- Read: own, manager, finance, administrators. Write: administrators only —
-- advances and manual adjustments are administrative acts, and commission
-- offsets are posted by the approval workflow.
-- ---------------------------------------------------------------------------

alter table public.employee_draw_ledger enable row level security;

revoke all on table public.employee_draw_ledger from anon;
grant select, insert on table public.employee_draw_ledger to authenticated;

drop policy if exists "Draw ledger is readable by the employee, their manager, finance and administrators" on public.employee_draw_ledger;
create policy "Draw ledger is readable by the employee, their manager, finance and administrators"
  on public.employee_draw_ledger
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.manages_profile(profile_id)
    or public.current_profile_role_is('accounting', 'admin', 'ceo')
  );

drop policy if exists "Draw ledger entries are created by administrators" on public.employee_draw_ledger;
create policy "Draw ledger entries are created by administrators"
  on public.employee_draw_ledger
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 4. Rollover ledger
-- ---------------------------------------------------------------------------

alter table public.commission_rollover_ledger enable row level security;

revoke all on table public.commission_rollover_ledger from anon;
grant select, insert on table public.commission_rollover_ledger to authenticated;

drop policy if exists "Rollover ledger is readable by the employee, their manager, finance and administrators" on public.commission_rollover_ledger;
create policy "Rollover ledger is readable by the employee, their manager, finance and administrators"
  on public.commission_rollover_ledger
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.manages_profile(profile_id)
    or public.current_profile_role_is('accounting', 'admin', 'ceo')
  );

drop policy if exists "Rollover ledger entries are created by administrators" on public.commission_rollover_ledger;
create policy "Rollover ledger entries are created by administrators"
  on public.commission_rollover_ledger
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('admin', 'ceo')
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 5. Commission events
--
-- Read: own, manager, finance, administrators. Insert: accounting and
-- administrators (accounting calculates and submits). Update: the same set, with
-- the state machine trigger deciding which transitions each role may make.
-- Delete: nobody.
-- ---------------------------------------------------------------------------

alter table public.commission_events enable row level security;

revoke all on table public.commission_events from anon;
grant select, insert, update on table public.commission_events to authenticated;

drop policy if exists "Commission events are readable by the participant, their manager, finance and administrators" on public.commission_events;
create policy "Commission events are readable by the participant, their manager, finance and administrators"
  on public.commission_events
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or public.manages_profile(profile_id)
    or public.current_profile_role_is('accounting', 'admin', 'ceo')
  );

drop policy if exists "Commission events are created by finance and administrators" on public.commission_events;
create policy "Commission events are created by finance and administrators"
  on public.commission_events
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('accounting', 'admin', 'ceo')
    and created_by = auth.uid()
  );

drop policy if exists "Commission events are updated by finance and administrators" on public.commission_events;
create policy "Commission events are updated by finance and administrators"
  on public.commission_events
  for update
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'))
  with check (public.current_profile_role_is('accounting', 'admin', 'ceo'));
