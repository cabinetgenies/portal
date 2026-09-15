-- Cabinet Genies Portal — Phase 5
-- Business architecture: departments, business roles, employee assignment, the
-- module registry, the role experience configuration and the knowledge metadata
-- foundation.
--
-- What this adds
--   1. public.departments          — where an employee belongs (10 official departments)
--   2. public.business_roles       — what an employee's app experience looks like
--   3. profiles.department_id /    — one primary department and one primary business
--      profiles.business_role_id      role per profile, alongside the existing
--                                     auth/security role and free-text department
--   4. public.app_modules          — the module registry (Home, Sales, …)
--   5. public.role_modules         — which modules a business role sees, and how
--   6. public.dashboard_widgets    — the reusable dashboard widget registry
--      public.role_dashboard_widgets
--   7. public.quick_actions        — the reusable quick action registry
--      public.role_quick_actions
--   8. public.knowledge_items      — BOS/Knowledge metadata (secondary content)
--      public.knowledge_item_roles
--
-- What this deliberately does NOT do
--   * It does not touch commission math, commission history, plan versions, audits,
--     job financials or any existing RLS policy. Nothing here is on the commission
--     calculation path.
--   * It does not replace the existing security roles (employee | supervisor |
--     accounting | admin | ceo). Those stay authoritative for authorization and
--     RLS. Business roles decide *experience only*: which modules, widgets and
--     quick actions are surfaced.
--   * It does not store capability requirements in the configuration tables. A
--     capability list is authorization, and authorization is code
--     (lib/permissions/module-capabilities.ts) so that editing an experience can
--     never widen what a person is allowed to do.
--   * It does not create a multi-role assignment model. One primary department and
--     one primary business role per profile is the agreed Phase 5 scope; the
--     columns are nullable so nothing breaks before assignment.
--
-- Idempotent and safe to re-run. Existing rows are never deleted or truncated.

-- ---------------------------------------------------------------------------
-- 1. Departments
--
-- Where an employee belongs. A department is not a role: it owns the grouping,
-- the owner and the operational reporting line, and it is what knowledge content
-- and future department dashboards are scoped by.
-- ---------------------------------------------------------------------------

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_slug_not_blank check (btrim(slug) <> ''),
  constraint departments_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint departments_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists departments_slug_key on public.departments (slug);
create unique index if not exists departments_name_key on public.departments (lower(name));
create index if not exists departments_active_idx on public.departments (active, display_order);
create index if not exists departments_owner_idx on public.departments (owner_profile_id);

comment on table public.departments is
  'Official departments. Department answers "where does this person belong"; business_roles answers "what does their app experience look like".';
comment on column public.departments.slug is
  'Stable machine key (marketing, sales, project-management, …). Never renamed; the name is what changes.';
comment on column public.departments.owner_profile_id is
  'Department owner. Display and future routing only — it grants nothing by itself.';

-- ---------------------------------------------------------------------------
-- 2. Business roles
--
-- What an employee's app experience looks like. Data-driven and configurable: a
-- role is a row, so adding "Estimator II" later is configuration, not a code
-- change. `key` is the stable machine key the code registry, tests and seeds
-- refer to.
-- ---------------------------------------------------------------------------

create table if not exists public.business_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  department_id uuid references public.departments (id) on delete set null,
  is_system boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_roles_key_not_blank check (btrim(key) <> ''),
  constraint business_roles_key_format check (key = lower(key) and key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint business_roles_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists business_roles_key_key on public.business_roles (key);
create unique index if not exists business_roles_name_key on public.business_roles (lower(name));
create index if not exists business_roles_department_idx on public.business_roles (department_id);
create index if not exists business_roles_active_idx on public.business_roles (active, display_order);

comment on table public.business_roles is
  'Business role catalog. A business role is an experience profile (modules, dashboard widgets, quick actions, knowledge scope), not an authorization role. Authorization stays with profiles.role and Row Level Security.';
comment on column public.business_roles.department_id is
  'The department a role normally belongs to. A person''s assigned department may differ — an Office Manager covering Sales keeps the Sales department and the Office Manager experience.';
comment on column public.business_roles.is_system is
  'True for CEO and Admin, which every deployment must keep.';

-- ---------------------------------------------------------------------------
-- 3. Employee assignment on profiles
--
-- One primary department and one primary business role. Both nullable: an
-- unassigned profile keeps working, and the resolver falls back to the
-- auth/security role so an account is never left with an empty app.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists department_id uuid references public.departments (id) on delete set null,
  add column if not exists business_role_id uuid references public.business_roles (id) on delete set null;

create index if not exists profiles_department_id_idx on public.profiles (department_id);
create index if not exists profiles_business_role_id_idx on public.profiles (business_role_id);

comment on column public.profiles.department_id is
  'Primary department assignment (registry). Supersedes the free-text profiles.department column, which is kept in step below for anything that still reads it.';
comment on column public.profiles.business_role_id is
  'Primary business role assignment. Decides the role experience only; never grants access.';

-- The free-text `department` column predates the registry and is still read by the
-- audit trail and any ad-hoc reporting. Rather than duplicating it in application
-- code, one trigger keeps it equal to the assigned department's name whenever a
-- department is assigned. When no registry department is assigned the legacy text
-- is left untouched, so nothing that writes it today is broken.
create or replace function public.sync_profile_department_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_name text;
begin
  if new.department_id is not null then
    select d.name into assigned_name
    from public.departments d
    where d.id = new.department_id;

    if assigned_name is not null then
      new.department := assigned_name;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_profile_department_name() from public;

drop trigger if exists profiles_sync_department_name on public.profiles;
create trigger profiles_sync_department_name
  before insert or update on public.profiles
  for each row
  execute function public.sync_profile_department_name();

-- Assignment is a privileged change, exactly like role, manager and status: a
-- signed-in employee must not be able to rewrite their own department or role
-- experience.
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
    or new.active is distinct from old.active
    or new.manager_id is distinct from old.manager_id
    or new.department is distinct from old.department
    or new.department_id is distinct from old.department_id
    or new.business_role_id is distinct from old.business_role_id
    or new.email is distinct from old.email
  then
    raise exception
      'Only administrators can change role, department, business role, manager, active or email'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_privileged_columns() from public;

comment on function public.protect_profile_privileged_columns() is
  'Blocks non-administrators from changing role, active, manager, department (text or registry), business role or email on a profile.';

-- Profile audit, extended for the two assignment columns. The legacy department
-- text check now only reports when no registry department is involved, so one
-- assignment change produces one readable audit row instead of two.
create or replace function public.log_profile_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  previous_manager jsonb;
  next_manager jsonb;
  previous_department jsonb;
  next_department jsonb;
  previous_role jsonb;
  next_role jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'user_created',
      actor,
      jsonb_build_object('after', to_jsonb(new) - 'created_at' - 'updated_at')
    );

    return new;
  end if;

  if new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.display_name is distinct from old.display_name
  then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'user_name_changed',
      actor,
      jsonb_build_object(
        'first_name', jsonb_build_object('from', old.first_name, 'to', new.first_name),
        'last_name', jsonb_build_object('from', old.last_name, 'to', new.last_name),
        'display_name', jsonb_build_object('from', old.display_name, 'to', new.display_name)
      )
    );
  end if;

  if new.role is distinct from old.role then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'role_changed',
      actor,
      jsonb_build_object('role', jsonb_build_object('from', old.role, 'to', new.role))
    );
  end if;

  if new.department_id is distinct from old.department_id then
    -- Resolve both sides to names as well as ids so the entry still reads well
    -- after a department is renamed.
    select jsonb_build_object('department_id', d.id, 'department_name', d.name)
      into previous_department
      from public.departments d
      where d.id = old.department_id;

    select jsonb_build_object('department_id', d.id, 'department_name', d.name)
      into next_department
      from public.departments d
      where d.id = new.department_id;

    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'department_assignment_changed',
      actor,
      jsonb_build_object('from', previous_department, 'to', next_department)
    );
  elsif new.department is distinct from old.department then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'department_changed',
      actor,
      jsonb_build_object(
        'department', jsonb_build_object('from', old.department, 'to', new.department)
      )
    );
  end if;

  if new.business_role_id is distinct from old.business_role_id then
    select jsonb_build_object('business_role_id', r.id, 'business_role_name', r.name)
      into previous_role
      from public.business_roles r
      where r.id = old.business_role_id;

    select jsonb_build_object('business_role_id', r.id, 'business_role_name', r.name)
      into next_role
      from public.business_roles r
      where r.id = new.business_role_id;

    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'business_role_changed',
      actor,
      jsonb_build_object('from', previous_role, 'to', next_role)
    );
  end if;

  if new.manager_id is distinct from old.manager_id then
    -- Resolve both sides to a readable name as well as the id, so the audit entry
    -- still makes sense after a profile is renamed.
    select jsonb_build_object(
             'manager_id', p.id,
             'manager_name', coalesce(
               nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
               p.display_name,
               p.email
             )
           )
      into previous_manager
      from public.profiles p
      where p.id = old.manager_id;

    select jsonb_build_object(
             'manager_id', p.id,
             'manager_name', coalesce(
               nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
               p.display_name,
               p.email
             )
           )
      into next_manager
      from public.profiles p
      where p.id = new.manager_id;

    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'manager_changed',
      actor,
      jsonb_build_object('from', previous_manager, 'to', next_manager)
    );
  end if;

  if new.active is distinct from old.active then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'active_status_changed',
      actor,
      jsonb_build_object('active', jsonb_build_object('from', old.active, 'to', new.active))
    );
  end if;

  if new.email is distinct from old.email then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      'profile',
      new.id,
      'user_email_changed',
      actor,
      jsonb_build_object('email', jsonb_build_object('from', old.email, 'to', new.email))
    );
  end if;

  return new;
end;
$$;

comment on function public.log_profile_audit_event() is
  'Writes one append-only audit row per profile change: user created, name, security role, department assignment, business role, manager, active status and email. Runs as SECURITY DEFINER so portal code cannot fabricate or edit the history.';

-- ---------------------------------------------------------------------------
-- 4. Module registry
--
-- One row per module the portal can show. Nothing else may hardcode a module:
-- the navigation, the workspace cards, the role experience preview and the admin
-- role editor all read this registry.
-- ---------------------------------------------------------------------------

create table if not exists public.app_modules (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  slug text not null,
  name text not null,
  description text,
  href text not null,
  icon_key text not null,
  nav_section text not null default 'primary',
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_modules_key_not_blank check (btrim(key) <> ''),
  constraint app_modules_key_format check (key = lower(key) and key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint app_modules_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint app_modules_name_not_blank check (btrim(name) <> ''),
  constraint app_modules_href_is_path check (href like '/%'),
  constraint app_modules_nav_section_check check (nav_section in ('primary', 'support', 'admin'))
);

create unique index if not exists app_modules_key_key on public.app_modules (key);
create unique index if not exists app_modules_slug_key on public.app_modules (slug);
create index if not exists app_modules_display_order_idx on public.app_modules (display_order);

comment on table public.app_modules is
  'Module registry. The single source of truth for which modules exist, what they are called, where they live and which navigation section they appear in. Capability requirements are deliberately not stored here — see lib/permissions/module-capabilities.ts.';
comment on column public.app_modules.nav_section is
  'primary (the operating business), support (BOS/Knowledge and other secondary content) or admin.';
comment on column public.app_modules.icon_key is
  'Key into the application icon set (components/app-shell/nav-icons.tsx). Never a raw SVG.';

-- ---------------------------------------------------------------------------
-- 5. Role → module experience
--
-- Experience, not permission: hiding a module here does not and must not remove
-- access. Every route re-checks authorization server-side and Postgres enforces
-- RLS regardless of what this table says.
-- ---------------------------------------------------------------------------

create table if not exists public.role_modules (
  id uuid primary key default gen_random_uuid(),
  business_role_id uuid not null references public.business_roles (id) on delete cascade,
  module_id uuid not null references public.app_modules (id) on delete cascade,
  is_visible boolean not null default true,
  is_emphasized boolean not null default false,
  is_default_landing boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_modules_unique unique (business_role_id, module_id)
);

create index if not exists role_modules_role_idx on public.role_modules (business_role_id, display_order);
create index if not exists role_modules_module_idx on public.role_modules (module_id);

comment on table public.role_modules is
  'Role module experience: which modules a business role sees, which are emphasized and which is the landing module. Cosmetic and experience-driven — never an authorization boundary.';

-- ---------------------------------------------------------------------------
-- 6. Dashboard widget registry and role assignment
-- ---------------------------------------------------------------------------

create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  component_key text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_widgets_key_not_blank check (btrim(key) <> ''),
  constraint dashboard_widgets_key_format check (key = lower(key) and key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint dashboard_widgets_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists dashboard_widgets_key_key on public.dashboard_widgets (key);
create index if not exists dashboard_widgets_display_order_idx on public.dashboard_widgets (display_order);

comment on table public.dashboard_widgets is
  'Reusable dashboard widget registry. component_key names the renderer in lib/experience/widget-registry.ts; a widget exists in the catalogue even when its live data source is not connected yet, in which case it renders an explicit empty state.';

create table if not exists public.role_dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  business_role_id uuid not null references public.business_roles (id) on delete cascade,
  widget_id uuid not null references public.dashboard_widgets (id) on delete cascade,
  is_visible boolean not null default true,
  span integer not null default 1,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_dashboard_widgets_unique unique (business_role_id, widget_id),
  constraint role_dashboard_widgets_span_check check (span between 1 and 3)
);

create index if not exists role_dashboard_widgets_role_idx
  on public.role_dashboard_widgets (business_role_id, display_order);
create index if not exists role_dashboard_widgets_widget_idx
  on public.role_dashboard_widgets (widget_id);

comment on table public.role_dashboard_widgets is
  'Role dashboard composition: which widgets a business role shows, in what order and how wide. Deliberately not a layout engine — no drag and drop, no per-user layout.';

-- ---------------------------------------------------------------------------
-- 7. Quick action registry and role assignment
-- ---------------------------------------------------------------------------

create table if not exists public.quick_actions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  label text not null,
  description text,
  href text,
  action_key text,
  icon_key text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_actions_key_not_blank check (btrim(key) <> ''),
  constraint quick_actions_key_format check (key = lower(key) and key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint quick_actions_label_not_blank check (btrim(label) <> ''),
  constraint quick_actions_href_is_path check (href is null or href like '/%'),
  constraint quick_actions_target_present check (href is not null or action_key is not null)
);

create unique index if not exists quick_actions_key_key on public.quick_actions (key);
create index if not exists quick_actions_display_order_idx on public.quick_actions (display_order);

comment on table public.quick_actions is
  'Reusable quick action registry. An action either navigates (href) or names an operation the application handles (action_key); an action whose destination does not exist yet is seeded inactive rather than pointing somewhere misleading.';
comment on column public.quick_actions.is_active is
  'False keeps the action in the catalogue as a documented plan while hiding it from every dashboard.';

create table if not exists public.role_quick_actions (
  id uuid primary key default gen_random_uuid(),
  business_role_id uuid not null references public.business_roles (id) on delete cascade,
  quick_action_id uuid not null references public.quick_actions (id) on delete cascade,
  is_visible boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_quick_actions_unique unique (business_role_id, quick_action_id)
);

create index if not exists role_quick_actions_role_idx
  on public.role_quick_actions (business_role_id, display_order);
create index if not exists role_quick_actions_action_idx
  on public.role_quick_actions (quick_action_id);

comment on table public.role_quick_actions is
  'Which quick actions a business role is offered, in order. Capability requirements for an action live in code, not here.';

-- ---------------------------------------------------------------------------
-- 8. Knowledge metadata foundation (BOS / Knowledge)
--
-- Metadata first. Content migration from Notion is explicitly out of scope for
-- this phase, and no sample business content is invented: the table starts empty
-- and the /knowledge module says so.
--
-- Scoping is intentionally twofold:
--   * business_role_id / department_id  — the primary owner scope, which is what
--     the Phase 5 data model asks for and what a role expectation belongs to.
--   * knowledge_item_roles              — additional roles the same item is
--     relevant to (one SOP can serve three roles without being duplicated).
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  type text not null,
  status text not null default 'draft',
  department_id uuid references public.departments (id) on delete set null,
  business_role_id uuid references public.business_roles (id) on delete set null,
  description text,
  body text,
  reference_url text,
  tags text[] not null default '{}',
  context_key text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_items_title_not_blank check (btrim(title) <> ''),
  constraint knowledge_items_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint knowledge_items_type_check check (
    type in (
      'training',
      'sop',
      'role_expectation',
      'playbook',
      'form_reference',
      'document',
      'policy',
      'decision_guide'
    )
  ),
  constraint knowledge_items_status_check check (status in ('draft', 'published', 'archived'))
);

create unique index if not exists knowledge_items_slug_key on public.knowledge_items (slug);
create index if not exists knowledge_items_type_idx on public.knowledge_items (type, status);
create index if not exists knowledge_items_department_idx on public.knowledge_items (department_id);
create index if not exists knowledge_items_business_role_idx on public.knowledge_items (business_role_id);
create index if not exists knowledge_items_context_key_idx on public.knowledge_items (context_key);
create index if not exists knowledge_items_tags_idx on public.knowledge_items using gin (tags);

comment on table public.knowledge_items is
  'BOS/Knowledge metadata: training, SOPs, role expectations, playbooks, forms, documents, policies and decision guides. Support content inside the operating app — not the product itself.';
comment on column public.knowledge_items.business_role_id is
  'Primary role scope. Null means the item is not role-specific. Use knowledge_item_roles for additional roles.';
comment on column public.knowledge_items.context_key is
  'Stable key a module can ask for, such as commission-overview or inventory-receiving, so a screen can surface its own contextual help without a hardcoded join.';

create table if not exists public.knowledge_item_roles (
  id uuid primary key default gen_random_uuid(),
  knowledge_item_id uuid not null references public.knowledge_items (id) on delete cascade,
  business_role_id uuid not null references public.business_roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint knowledge_item_roles_unique unique (knowledge_item_id, business_role_id)
);

create index if not exists knowledge_item_roles_role_idx
  on public.knowledge_item_roles (business_role_id);

comment on table public.knowledge_item_roles is
  'Additional role scope for a knowledge item, on top of its primary business_role_id.';

-- ---------------------------------------------------------------------------
-- 9. updated_at and audit
--
-- Every configuration table joins the existing append-only audit trail through
-- the generic public.log_config_audit_event trigger, so role assignment, role
-- module visibility, dashboard composition and quick action changes are all
-- attributable. The trigger is SECURITY DEFINER: the application cannot forge or
-- edit history.
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
  targets text[] := array[
    'departments',
    'business_roles',
    'app_modules',
    'role_modules',
    'dashboard_widgets',
    'role_dashboard_widgets',
    'quick_actions',
    'role_quick_actions',
    'knowledge_items',
    'knowledge_item_roles'
  ];
begin
  foreach target in array targets
  loop
    execute format('drop trigger if exists %I on public.%I', target || '_set_updated_at', target);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      target || '_set_updated_at',
      target
    );

    execute format('drop trigger if exists %I on public.%I', target || '_audit', target);
    execute format(
      'create trigger %I after insert or update on public.%I for each row execute function public.log_config_audit_event(%L)',
      target || '_audit',
      target,
      target
    );
  end loop;
end;
$$;
