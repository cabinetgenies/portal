-- Cabinet Genies Portal — Phase 5
-- Seed configuration: the official departments, the initial business role
-- catalog, the module registry, the widget and quick action catalogs, and one
-- default experience per role.
--
-- These are defaults, not immutable truth. Departments and roles are reference
-- data an administrator can rename; a role's module list, dashboard and quick
-- actions are configuration an administrator can change under /admin/roles. That
-- is why the role-experience inserts are `on conflict do nothing`: re-running this
-- file after an administrator has edited a role must not undo their work.
--
-- Catalog rows (departments, roles, modules, widgets, actions) are reconciled from
-- the code registry on every run so a deployment cannot drift from the code that
-- references those keys. `active` is never reset — deliberately disabling a role,
-- module, widget or action is an administrative decision.
--
-- No knowledge content is seeded. Migrating Notion content is explicitly out of
-- scope for this phase, and inventing sample SOPs would be fake operational data.
--
-- Idempotent and safe to re-run. Nothing is truncated or deleted.

-- ---------------------------------------------------------------------------
-- 1. Departments
-- ---------------------------------------------------------------------------

insert into public.departments (slug, name, description, display_order)
values
  ('marketing', 'Marketing', 'Brand, lead generation and market presence.', 10),
  ('sales', 'Sales', 'Lead qualification, design consultations and sold projects.', 20),
  ('design', 'Design', 'Design development, drawings and specifications.', 30),
  ('estimating', 'Estimating', 'Take-off, pricing and estimate preparation.', 40),
  ('purchasing', 'Purchasing', 'Supplier orders, procurement and vendor coordination.', 50),
  ('warehousing', 'Warehousing', 'Receiving, storage, staging and material handling.', 60),
  ('project-management', 'Project Management', 'Project handoff, scheduling and delivery.', 70),
  ('field-management', 'Field Management', 'Installation crews, site supervision and field support.', 80),
  ('bookkeeping', 'Bookkeeping', 'Accounting, payables, payroll support and commissions.', 90),
  ('office-management', 'Office Management', 'Office operations, administration and internal support.', 100)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 2. Business roles
--
-- CEO and Admin carry no single department: they are company-wide experiences.
-- ---------------------------------------------------------------------------

insert into public.business_roles (key, name, description, department_id, is_system, display_order)
select
  seed.key,
  seed.name,
  seed.description,
  departments.id,
  seed.is_system,
  seed.display_order
from (
  values
    ('ceo', 'CEO', 'Company-wide view of every operating module and every configuration surface.', null, true, 10),
    ('admin', 'Admin', 'Portal administration: users, departments, roles, role experiences and settings.', null, true, 20),
    ('sales_leader', 'Sales Leader', 'Owns the sales pipeline and the sales team''s commission outcomes.', 'sales', false, 30),
    ('sales_designer', 'Sales Designer', 'Sells and designs: own projects and own commission position.', 'sales', false, 40),
    ('designer', 'Designer', 'Design development for projects in delivery.', 'design', false, 50),
    ('estimator', 'Estimator', 'Estimates and pricing for projects in the pipeline.', 'estimating', false, 60),
    ('purchasing', 'Purchasing', 'Procurement and vendor coordination for active projects.', 'purchasing', false, 70),
    ('warehouse', 'Warehouse', 'Receiving, staging and material movement.', 'warehousing', false, 80),
    ('project_manager', 'Project Manager', 'Owns project delivery from handoff to completion.', 'project-management', false, 90),
    ('field_manager', 'Field Manager', 'Owns crews and field execution on site.', 'field-management', false, 100),
    ('bookkeeping', 'Bookkeeping', 'Financial processing, including commission approval and payment.', 'bookkeeping', false, 110),
    ('office_manager', 'Office Manager', 'Office operations and internal support.', 'office-management', false, 120)
) as seed (key, name, description, department_slug, is_system, display_order)
left join public.departments on departments.slug = seed.department_slug
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      department_id = excluded.department_id,
      is_system = excluded.is_system,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 3. Module registry
--
-- Primary modules are the operating business. Knowledge is secondary support
-- content, and Admin is the configuration surface — the navigation renders the
-- three sections in that order.
-- ---------------------------------------------------------------------------

insert into public.app_modules (key, slug, name, description, href, icon_key, nav_section, display_order)
values
  ('home', 'home', 'Home', 'Your role-aware dashboard: what needs your attention today.', '/home', 'dashboard', 'primary', 10),
  ('sales', 'sales', 'Sales', 'Sales overview, pipeline entry points and the commission sub-app.', '/sales', 'sales', 'primary', 20),
  ('projects', 'projects', 'Projects', 'Project and job records the portal owns, with Buildertrend remaining the execution system of record.', '/projects', 'projects', 'primary', 30),
  ('commissions', 'commissions', 'Commissions', 'Commission jobs, projection, approval and payment.', '/sales/commissions', 'commissions', 'primary', 40),
  ('requests', 'requests', 'Requests & Approvals', 'Internal requests and the approvals they need.', '/requests', 'requests', 'primary', 50),
  ('people', 'people', 'People', 'The team, their departments, roles and reporting lines.', '/people', 'people', 'primary', 60),
  ('inventory', 'inventory', 'Inventory', 'Items, receiving, allocations, adjustments and stock levels.', '/inventory', 'inventory', 'primary', 70),
  ('operations', 'operations', 'Operations', 'Department operational support that does not belong in Buildertrend.', '/operations', 'operations', 'primary', 80),
  ('knowledge', 'knowledge', 'Knowledge', 'BOS: training, SOPs, role expectations, playbooks, forms and policies.', '/knowledge', 'knowledge', 'support', 90),
  ('admin', 'admin', 'Admin', 'Users, departments, roles, role experiences and portal settings.', '/admin', 'admin', 'admin', 100)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      href = excluded.href,
      icon_key = excluded.icon_key,
      nav_section = excluded.nav_section,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 4. Dashboard widget registry
--
-- component_key names a renderer, not a widget: projected_commission,
-- pending_commission and ready_to_pay are three widgets over one amount
-- renderer, and the attention widgets share one list renderer. That is what keeps
-- the dashboard reusable instead of one bespoke component per role.
-- ---------------------------------------------------------------------------

insert into public.dashboard_widgets (key, name, description, component_key, display_order)
values
  ('my_projects', 'My projects', 'The signed-in person''s projects and their current status.', 'projects_summary', 10),
  ('projected_commission', 'Projected commission', 'Commission projected on the person''s own jobs.', 'commission_amount', 20),
  ('pending_commission', 'Pending commission', 'Commission awaiting approval.', 'commission_amount', 30),
  ('ready_to_pay', 'Ready to pay', 'Approved commission that has not been paid yet.', 'commission_amount', 40),
  ('commission_summary', 'Commission summary', 'Company-wide commission position.', 'metric_summary', 50),
  ('my_requests', 'My requests', 'Requests this person has raised and where they stand.', 'attention_list', 60),
  ('my_approvals', 'My approvals', 'Items waiting on this person''s decision.', 'attention_list', 70),
  ('training_due', 'Training due', 'Role training that is due or overdue.', 'attention_list', 80),
  ('inventory_alerts', 'Inventory alerts', 'Low stock and receiving exceptions.', 'attention_list', 90),
  ('leadership_attention', 'Leadership attention', 'Items the leadership team should look at.', 'attention_list', 100),
  ('projects_at_risk', 'Projects at risk', 'Projects whose schedule or margin needs attention.', 'metric_summary', 110),
  ('department_health', 'Department health', 'Workload and delivery health by department.', 'metric_summary', 120),
  ('company_activity', 'Company activity', 'Recent audited changes across the portal.', 'activity_feed', 130)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      component_key = excluded.component_key,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 5. Quick action registry
--
-- Only actions that reach something real are active. New Project points at the
-- commission job form because that is where a project record is actually created
-- today, and financial editing is an accounting capability, so it is offered to
-- the roles that hold it rather than to everyone whose job touches money.
--
-- The planned actions (receiving, adjustments, handoff review, document upload,
-- Buildertrend) are catalogued inactive: they document the intent without
-- pointing anybody at a screen that does not exist.
-- ---------------------------------------------------------------------------

insert into public.quick_actions (key, label, description, href, action_key, icon_key, is_active, display_order)
values
  ('new_project', 'New Project', 'Create a new project record.', '/projects/new', null, 'projects', true, 10),
  ('view_projects', 'View Projects', 'Open the project list.', '/projects', null, 'projects', true, 20),
  ('view_commissions', 'View Commissions', 'Open commissions.', '/sales/commissions', null, 'commissions', true, 30),
  ('review_approvals', 'Review Approvals', 'Open the approval and payment queue.', '/sales/commissions/payments', null, 'commissions', true, 40),
  ('update_financials', 'Update Financials', 'Enter or correct a project''s financial inputs.', '/projects', null, 'commissions', true, 50),
  ('submit_request', 'Submit Request', 'Raise a request for someone to action.', '/requests', null, 'requests', true, 60),
  ('view_people', 'View People', 'Open the people directory.', '/people', null, 'people', true, 70),
  ('open_inventory', 'Open Inventory', 'Open the inventory module.', '/inventory', null, 'inventory', true, 80),
  ('open_knowledge', 'Open Knowledge', 'Open BOS: training, SOPs and playbooks.', '/knowledge', null, 'knowledge', true, 90),
  ('manage_users', 'Manage Users', 'Add users and change roles, departments and reporting lines.', '/admin/users', null, 'admin', true, 100),
  ('manage_roles', 'Manage Roles', 'Configure what each business role sees.', '/admin/roles', null, 'admin', true, 110),
  ('view_role_experiences', 'View Role Experiences', 'Preview any role''s system read-only.', '/admin/role-experiences', null, 'admin', true, 120),
  ('company_settings', 'Company Settings', 'Portal and company-level settings.', '/admin/settings', null, 'admin', true, 130),
  ('receive_inventory', 'Receive Inventory', 'Receive a delivery into stock.', null, 'receive_inventory', 'inventory', false, 140),
  ('adjust_inventory', 'Adjust Inventory', 'Adjust stock with a reason.', null, 'adjust_inventory', 'inventory', false, 150),
  ('review_handoff', 'Review Handoff', 'Review a sales-to-delivery handoff.', null, 'review_handoff', 'operations', false, 160),
  ('upload_document', 'Upload Document', 'Attach a document to a record.', null, 'upload_document', 'knowledge', false, 170),
  ('open_buildertrend', 'Open Buildertrend', 'Jump to Buildertrend, which stays the execution system of record.', null, 'open_buildertrend', 'operations', false, 180)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description,
      href = excluded.href,
      action_key = excluded.action_key,
      icon_key = excluded.icon_key,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 6. Role → module experience
--
-- Company-wide roles take every module. Everyone else gets one row per module, so
-- a hidden module is a stored decision rather than an absence.
-- ---------------------------------------------------------------------------

insert into public.role_modules (business_role_id, module_id, is_visible, display_order)
select roles.id, modules.id, true, modules.display_order
from public.business_roles as roles
join public.app_modules as modules on true
where roles.key in ('ceo', 'admin')
on conflict (business_role_id, module_id) do nothing;

insert into public.role_modules (
  business_role_id,
  module_id,
  is_visible,
  is_emphasized,
  display_order
)
select
  roles.id,
  modules.id,
  seed.is_visible,
  seed.is_emphasized,
  seed.display_order
from (
  values
    -- Sales Leader
    ('sales_leader', 'home', true, false, 10),
    ('sales_leader', 'sales', true, true, 20),
    ('sales_leader', 'projects', true, false, 30),
    ('sales_leader', 'commissions', true, true, 40),
    ('sales_leader', 'requests', true, false, 50),
    ('sales_leader', 'people', true, false, 60),
    ('sales_leader', 'knowledge', true, false, 90),
    -- Sales Designer
    ('sales_designer', 'home', true, false, 10),
    ('sales_designer', 'sales', true, true, 20),
    ('sales_designer', 'projects', true, false, 30),
    ('sales_designer', 'commissions', true, true, 40),
    ('sales_designer', 'requests', true, false, 50),
    ('sales_designer', 'people', true, false, 60),
    ('sales_designer', 'knowledge', true, false, 90),
    -- Designer
    ('designer', 'home', true, false, 10),
    ('designer', 'projects', true, true, 30),
    ('designer', 'requests', true, false, 50),
    ('designer', 'people', true, false, 60),
    ('designer', 'knowledge', true, false, 90),
    -- Estimator
    ('estimator', 'home', true, false, 10),
    ('estimator', 'projects', true, true, 30),
    ('estimator', 'requests', true, false, 50),
    ('estimator', 'knowledge', true, false, 90),
    -- Purchasing
    ('purchasing', 'home', true, false, 10),
    ('purchasing', 'projects', true, true, 30),
    ('purchasing', 'requests', true, false, 50),
    ('purchasing', 'inventory', true, true, 70),
    ('purchasing', 'knowledge', true, false, 90),
    -- Warehouse
    ('warehouse', 'home', true, false, 10),
    ('warehouse', 'requests', true, false, 50),
    ('warehouse', 'inventory', true, true, 70),
    ('warehouse', 'knowledge', true, false, 90),
    -- Project Manager
    ('project_manager', 'home', true, false, 10),
    ('project_manager', 'projects', true, true, 30),
    ('project_manager', 'requests', true, false, 50),
    ('project_manager', 'people', true, false, 60),
    ('project_manager', 'operations', true, true, 80),
    ('project_manager', 'knowledge', true, false, 90),
    -- Field Manager
    ('field_manager', 'home', true, false, 10),
    ('field_manager', 'projects', true, true, 30),
    ('field_manager', 'requests', true, false, 50),
    ('field_manager', 'operations', true, true, 80),
    ('field_manager', 'knowledge', true, false, 90),
    -- Bookkeeping
    ('bookkeeping', 'home', true, false, 10),
    ('bookkeeping', 'requests', true, false, 50),
    ('bookkeeping', 'people', true, false, 60),
    ('bookkeeping', 'knowledge', true, false, 90),
    -- Office Manager
    ('office_manager', 'home', true, false, 10),
    ('office_manager', 'requests', true, false, 50),
    ('office_manager', 'people', true, false, 60),
    ('office_manager', 'knowledge', true, false, 90)
) as seed (role_key, module_key, is_visible, is_emphasized, display_order)
join public.business_roles as roles on roles.key = seed.role_key
join public.app_modules as modules on modules.key = seed.module_key
on conflict (business_role_id, module_id) do nothing;

-- Home is the landing module for every role: nobody lands on a module they may
-- not hold a capability for.
update public.role_modules
set is_default_landing = true
from public.app_modules
where role_modules.module_id = app_modules.id
  and app_modules.key = 'home'
  and role_modules.is_visible;

-- ---------------------------------------------------------------------------
-- 7. Role → dashboard widgets
-- ---------------------------------------------------------------------------

insert into public.role_dashboard_widgets (business_role_id, widget_id, is_visible, span, display_order)
select
  roles.id,
  widgets.id,
  true,
  seed.span,
  seed.display_order
from (
  values
    -- CEO: company-wide view.
    ('ceo', 'company_activity', 2, 10),
    ('ceo', 'leadership_attention', 2, 20),
    ('ceo', 'commission_summary', 1, 30),
    ('ceo', 'inventory_alerts', 1, 40),
    ('ceo', 'projects_at_risk', 1, 50),
    ('ceo', 'department_health', 1, 60),
    -- Admin: the same operating picture plus the approvals queue.
    ('admin', 'company_activity', 2, 10),
    ('admin', 'leadership_attention', 2, 20),
    ('admin', 'commission_summary', 1, 30),
    ('admin', 'my_approvals', 1, 40),
    ('admin', 'inventory_alerts', 1, 50),
    ('admin', 'department_health', 1, 60),
    -- Sales Leader: team pipeline and commission position.
    ('sales_leader', 'my_projects', 2, 10),
    ('sales_leader', 'commission_summary', 1, 20),
    ('sales_leader', 'my_approvals', 1, 30),
    ('sales_leader', 'my_requests', 1, 40),
    ('sales_leader', 'training_due', 1, 50),
    -- Sales Designer: own projects and own commission position.
    ('sales_designer', 'my_projects', 2, 10),
    ('sales_designer', 'projected_commission', 1, 20),
    ('sales_designer', 'pending_commission', 1, 30),
    ('sales_designer', 'ready_to_pay', 1, 40),
    ('sales_designer', 'my_requests', 1, 50),
    ('sales_designer', 'training_due', 1, 60),
    -- Designer
    ('designer', 'my_projects', 2, 10),
    ('designer', 'my_requests', 1, 20),
    ('designer', 'training_due', 1, 30),
    -- Estimator
    ('estimator', 'my_projects', 2, 10),
    ('estimator', 'my_requests', 1, 20),
    ('estimator', 'training_due', 1, 30),
    -- Purchasing
    ('purchasing', 'my_projects', 2, 10),
    ('purchasing', 'inventory_alerts', 1, 20),
    ('purchasing', 'my_requests', 1, 30),
    ('purchasing', 'training_due', 1, 40),
    -- Warehouse
    ('warehouse', 'inventory_alerts', 2, 10),
    ('warehouse', 'my_requests', 1, 20),
    ('warehouse', 'training_due', 1, 30),
    -- Project Manager
    ('project_manager', 'my_projects', 2, 10),
    ('project_manager', 'my_requests', 1, 20),
    ('project_manager', 'my_approvals', 1, 30),
    ('project_manager', 'training_due', 1, 40),
    -- Field Manager
    ('field_manager', 'my_projects', 2, 10),
    ('field_manager', 'my_requests', 1, 20),
    ('field_manager', 'my_approvals', 1, 30),
    ('field_manager', 'training_due', 1, 40),
    -- Bookkeeping
    ('bookkeeping', 'my_approvals', 2, 10),
    ('bookkeeping', 'commission_summary', 1, 20),
    ('bookkeeping', 'my_requests', 1, 30),
    ('bookkeeping', 'training_due', 1, 40),
    -- Office Manager
    ('office_manager', 'my_requests', 2, 10),
    ('office_manager', 'my_approvals', 1, 20),
    ('office_manager', 'department_health', 1, 30),
    ('office_manager', 'training_due', 1, 40)
) as seed (role_key, widget_key, span, display_order)
join public.business_roles as roles on roles.key = seed.role_key
join public.dashboard_widgets as widgets on widgets.key = seed.widget_key
on conflict (business_role_id, widget_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Role → quick actions
-- ---------------------------------------------------------------------------

insert into public.role_quick_actions (business_role_id, quick_action_id, is_visible, display_order)
select
  roles.id,
  actions.id,
  true,
  seed.display_order
from (
  values
    ('ceo', 'review_approvals', 10),
    ('ceo', 'manage_users', 20),
    ('ceo', 'manage_roles', 30),
    ('ceo', 'view_role_experiences', 40),
    ('ceo', 'company_settings', 50),
    ('admin', 'manage_users', 10),
    ('admin', 'manage_roles', 20),
    ('admin', 'view_role_experiences', 30),
    ('admin', 'company_settings', 40),
    ('admin', 'review_approvals', 50),
    ('sales_leader', 'view_commissions', 10),
    ('sales_leader', 'view_projects', 20),
    ('sales_leader', 'submit_request', 30),
    ('sales_designer', 'view_commissions', 10),
    ('sales_designer', 'view_projects', 20),
    ('sales_designer', 'submit_request', 30),
    ('sales_designer', 'open_knowledge', 40),
    ('designer', 'view_projects', 10),
    ('designer', 'submit_request', 20),
    ('designer', 'open_knowledge', 30),
    ('estimator', 'view_projects', 10),
    ('estimator', 'submit_request', 20),
    ('estimator', 'open_knowledge', 30),
    ('purchasing', 'view_projects', 10),
    ('purchasing', 'open_inventory', 20),
    ('purchasing', 'submit_request', 30),
    ('warehouse', 'open_inventory', 10),
    ('warehouse', 'submit_request', 20),
    ('warehouse', 'open_knowledge', 30),
    ('project_manager', 'view_projects', 10),
    ('project_manager', 'submit_request', 20),
    ('project_manager', 'open_knowledge', 30),
    ('field_manager', 'view_projects', 10),
    ('field_manager', 'submit_request', 20),
    ('field_manager', 'open_knowledge', 30),
    ('bookkeeping', 'update_financials', 10),
    ('bookkeeping', 'review_approvals', 20),
    ('bookkeeping', 'submit_request', 30),
    ('office_manager', 'submit_request', 10),
    ('office_manager', 'view_people', 20),
    ('office_manager', 'open_knowledge', 30)
) as seed (role_key, action_key, display_order)
join public.business_roles as roles on roles.key = seed.role_key
join public.quick_actions as actions on actions.key = seed.action_key
on conflict (business_role_id, quick_action_id) do nothing;
