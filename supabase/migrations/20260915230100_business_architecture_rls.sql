-- Cabinet Genies Portal — Phase 5
-- Row Level Security for the business architecture tables.
--
-- Policy intent
--   Any signed-in profile      : read the experience configuration. The module
--                                registry, departments, business roles, widgets
--                                and quick actions are what the shell needs to
--                                render somebody's own navigation, and none of it
--                                is sensitive — it exposes no employee data and no
--                                financial data.
--   admin / ceo                : write the configuration (departments, business
--                                roles, modules, role experiences, knowledge).
--   Everyone else              : no writes at all. Not even their own role's
--                                experience: that would be a privilege escalation.
--
-- Read access to configuration does NOT widen access to anything real. Every
-- module route still re-checks its capability server-side and the underlying
-- domain tables keep their own policies, so hiding or showing a module in this
-- configuration can never reveal commission, compensation or profile data.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Reference data: departments and business roles
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;

revoke all on table public.departments from anon;
grant select, insert, update, delete on table public.departments to authenticated;

drop policy if exists "Departments are readable by portal users" on public.departments;
create policy "Departments are readable by portal users"
  on public.departments
  for select
  to authenticated
  using (true);

drop policy if exists "Departments are managed by administrators" on public.departments;
create policy "Departments are managed by administrators"
  on public.departments
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.business_roles enable row level security;

revoke all on table public.business_roles from anon;
grant select, insert, update, delete on table public.business_roles to authenticated;

drop policy if exists "Business roles are readable by portal users" on public.business_roles;
create policy "Business roles are readable by portal users"
  on public.business_roles
  for select
  to authenticated
  using (true);

drop policy if exists "Business roles are managed by administrators" on public.business_roles;
create policy "Business roles are managed by administrators"
  on public.business_roles
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 2. Module registry and role module experience
-- ---------------------------------------------------------------------------

alter table public.app_modules enable row level security;

revoke all on table public.app_modules from anon;
grant select, insert, update, delete on table public.app_modules to authenticated;

drop policy if exists "Modules are readable by portal users" on public.app_modules;
create policy "Modules are readable by portal users"
  on public.app_modules
  for select
  to authenticated
  using (true);

drop policy if exists "Modules are managed by administrators" on public.app_modules;
create policy "Modules are managed by administrators"
  on public.app_modules
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.role_modules enable row level security;

revoke all on table public.role_modules from anon;
grant select, insert, update, delete on table public.role_modules to authenticated;

drop policy if exists "Role module experience is readable by portal users" on public.role_modules;
create policy "Role module experience is readable by portal users"
  on public.role_modules
  for select
  to authenticated
  using (true);

drop policy if exists "Role module experience is managed by administrators" on public.role_modules;
create policy "Role module experience is managed by administrators"
  on public.role_modules
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 3. Dashboard widgets and role dashboard composition
-- ---------------------------------------------------------------------------

alter table public.dashboard_widgets enable row level security;

revoke all on table public.dashboard_widgets from anon;
grant select, insert, update, delete on table public.dashboard_widgets to authenticated;

drop policy if exists "Dashboard widgets are readable by portal users" on public.dashboard_widgets;
create policy "Dashboard widgets are readable by portal users"
  on public.dashboard_widgets
  for select
  to authenticated
  using (true);

drop policy if exists "Dashboard widgets are managed by administrators" on public.dashboard_widgets;
create policy "Dashboard widgets are managed by administrators"
  on public.dashboard_widgets
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.role_dashboard_widgets enable row level security;

revoke all on table public.role_dashboard_widgets from anon;
grant select, insert, update, delete on table public.role_dashboard_widgets to authenticated;

drop policy if exists "Role dashboard composition is readable by portal users"
  on public.role_dashboard_widgets;
create policy "Role dashboard composition is readable by portal users"
  on public.role_dashboard_widgets
  for select
  to authenticated
  using (true);

drop policy if exists "Role dashboard composition is managed by administrators"
  on public.role_dashboard_widgets;
create policy "Role dashboard composition is managed by administrators"
  on public.role_dashboard_widgets
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 4. Quick actions and role quick actions
-- ---------------------------------------------------------------------------

alter table public.quick_actions enable row level security;

revoke all on table public.quick_actions from anon;
grant select, insert, update, delete on table public.quick_actions to authenticated;

drop policy if exists "Quick actions are readable by portal users" on public.quick_actions;
create policy "Quick actions are readable by portal users"
  on public.quick_actions
  for select
  to authenticated
  using (true);

drop policy if exists "Quick actions are managed by administrators" on public.quick_actions;
create policy "Quick actions are managed by administrators"
  on public.quick_actions
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.role_quick_actions enable row level security;

revoke all on table public.role_quick_actions from anon;
grant select, insert, update, delete on table public.role_quick_actions to authenticated;

drop policy if exists "Role quick actions are readable by portal users" on public.role_quick_actions;
create policy "Role quick actions are readable by portal users"
  on public.role_quick_actions
  for select
  to authenticated
  using (true);

drop policy if exists "Role quick actions are managed by administrators" on public.role_quick_actions;
create policy "Role quick actions are managed by administrators"
  on public.role_quick_actions
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 5. Knowledge items
--
-- Published knowledge is internal support content, so every signed-in portal user
-- may read it: that is what makes contextual help work without a per-role policy
-- matrix, and it exposes no employee or financial data. Drafts and archived items
-- are visible to administrators only. Writes are administrator-only in this
-- phase; a later phase can add department-level authoring without weakening
-- anything here.
-- ---------------------------------------------------------------------------

alter table public.knowledge_items enable row level security;

revoke all on table public.knowledge_items from anon;
grant select, insert, update, delete on table public.knowledge_items to authenticated;

drop policy if exists "Published knowledge is readable by portal users" on public.knowledge_items;
create policy "Published knowledge is readable by portal users"
  on public.knowledge_items
  for select
  to authenticated
  using (status = 'published' or public.current_profile_role_is('admin', 'ceo'));

drop policy if exists "Knowledge is managed by administrators" on public.knowledge_items;
create policy "Knowledge is managed by administrators"
  on public.knowledge_items
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));

alter table public.knowledge_item_roles enable row level security;

revoke all on table public.knowledge_item_roles from anon;
grant select, insert, update, delete on table public.knowledge_item_roles to authenticated;

drop policy if exists "Knowledge role scope is readable by portal users"
  on public.knowledge_item_roles;
create policy "Knowledge role scope is readable by portal users"
  on public.knowledge_item_roles
  for select
  to authenticated
  using (true);

drop policy if exists "Knowledge role scope is managed by administrators"
  on public.knowledge_item_roles;
create policy "Knowledge role scope is managed by administrators"
  on public.knowledge_item_roles
  for all
  to authenticated
  using (public.current_profile_role_is('admin', 'ceo'))
  with check (public.current_profile_role_is('admin', 'ceo'));
