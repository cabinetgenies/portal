-- Cabinet Genies Portal — Phase 6
-- Structural seed only: register the module, add the default Leadership Weekly
-- meeting template with its standard agenda, and record role defaults.
--
-- No scorecard numbers, priorities, issues, actions or reviews are invented here.
-- These are defaults an administrator can change, not immutable truth.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Module registry
-- ---------------------------------------------------------------------------

insert into public.app_modules (key, slug, name, description, href, icon_key, nav_section, display_order)
values (
  'performance',
  'performance',
  'Performance & Leadership',
  'Scorecards, quarterly priorities, meetings, issues, actions and reviews.',
  '/performance',
  'performance',
  'primary',
  65
)
on conflict (key) do update
  set slug = excluded.slug,
      name = excluded.name,
      description = excluded.description,
      href = excluded.href,
      icon_key = excluded.icon_key,
      nav_section = excluded.nav_section,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 2. Default role module defaults
-- ---------------------------------------------------------------------------

-- CEO and Admin already receive every active module from the Phase 5 seed, but
-- this keeps the new module explicit for them as well.
insert into public.role_modules (business_role_id, module_id, is_visible, is_emphasized, display_order)
select roles.id, modules.id, true, false, modules.display_order
from public.business_roles roles
join public.app_modules modules on modules.key = 'performance'
where roles.key in ('ceo', 'admin')
on conflict (business_role_id, module_id) do nothing;

-- Sales Leader is a leadership role and sees the module. Project Manager and
-- Field Manager are recorded as hidden until "acting as a department leader" is
-- modelled more precisely than a static role assignment can express.
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
  modules.display_order
from (
  values
    ('sales_leader', true, false),
    ('project_manager', false, false),
    ('field_manager', false, false)
) as seed (role_key, is_visible, is_emphasized)
join public.business_roles roles on roles.key = seed.role_key
join public.app_modules modules on modules.key = 'performance'
on conflict (business_role_id, module_id) do update
  set is_visible = excluded.is_visible,
      is_emphasized = excluded.is_emphasized,
      display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- 3. Default Leadership Weekly meeting template
-- ---------------------------------------------------------------------------

insert into public.meeting_templates (id, name, meeting_type, cadence)
values ('11111111-1111-4111-8111-111111111111', 'Leadership Weekly', 'leadership', 'weekly')
on conflict (id) do update
  set name = excluded.name,
      meeting_type = excluded.meeting_type,
      cadence = excluded.cadence;

-- The template has no natural unique key, so insert agenda by looking it up by
-- name/type. On a re-run this still preserves the original template row because
-- the agenda insert is keyed to that row and uses `on conflict do nothing`.
insert into public.meeting_agenda_sections (
  meeting_template_id,
  section_key,
  title,
  display_order
)
select
  template.id,
  seed.section_key,
  seed.title,
  seed.display_order
from (
  values
    ('scorecard', 'Scorecard', 10),
    ('priorities', 'Quarterly Priorities', 20),
    ('headlines', 'Headlines', 30),
    ('actions', 'To-Dos / Actions', 40),
    ('issues', 'Issues', 50),
    ('decisions', 'Decisions / Next Steps', 60)
) as seed (section_key, title, display_order)
join public.meeting_templates template
  on template.id = '11111111-1111-4111-8111-111111111111'
on conflict (meeting_template_id, section_key) do nothing;
