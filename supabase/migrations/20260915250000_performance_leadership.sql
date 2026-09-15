-- Cabinet Genies Portal — Phase 6
-- Performance & Leadership: additive tables for scorecards, quarterly priorities,
-- meetings, issues, actions, decisions and reviews.
--
-- This migration creates the domain tables only. It deliberately does not change
-- commission, compensation, Buildertrend workflows or any existing table.
-- Terminology and workflow details are expected to be refined later, so the schema
-- is intentionally small and uses plain names instead of an EOS/Ninety clone.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Scorecard measurables
-- ---------------------------------------------------------------------------

create table if not exists public.performance_measurables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'company',
  owner_profile_id uuid references public.profiles (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  employee_id uuid references public.profiles (id) on delete set null,
  target numeric,
  unit text,
  frequency text not null default 'weekly',
  current_value numeric,
  status text not null default 'no_data',
  notes text,
  knowledge_item_id uuid references public.knowledge_items (id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_measurables_name_not_blank check (btrim(name) <> ''),
  constraint performance_measurables_scope_check check (
    scope in ('company', 'department', 'employee')
  ),
  constraint performance_measurables_frequency_check check (
    frequency in ('weekly', 'monthly')
  ),
  constraint performance_measurables_status_check check (
    status in ('on_track', 'off_track', 'no_data')
  ),
  constraint performance_measurables_target_nonnegative check (
    target is null or target >= 0
  ),
  constraint performance_measurables_scope_department_check check (
    scope <> 'department' or department_id is not null
  ),
  constraint performance_measurables_scope_employee_check check (
    scope <> 'employee' or employee_id is not null
  )
);

create index if not exists performance_measurables_scope_idx
  on public.performance_measurables (scope, active);
create index if not exists performance_measurables_department_idx
  on public.performance_measurables (department_id);
create index if not exists performance_measurables_employee_idx
  on public.performance_measurables (employee_id);
create index if not exists performance_measurables_owner_idx
  on public.performance_measurables (owner_profile_id);

comment on table public.performance_measurables is
  'Scorecard measurables at company, department and employee scope. Weekly is the first supported frequency; the check already leaves room for monthly.';

-- ---------------------------------------------------------------------------
-- 2. Scorecard entries (append-only history)
-- ---------------------------------------------------------------------------

create table if not exists public.performance_scorecard_entries (
  id uuid primary key default gen_random_uuid(),
  measurable_id uuid not null
    references public.performance_measurables (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target_snapshot numeric,
  actual_value numeric,
  status text not null default 'no_data',
  entered_by uuid references public.profiles (id) on delete set null,
  entered_at timestamptz not null default now(),
  notes text,
  constraint performance_scorecard_entries_status_check check (
    status in ('on_track', 'off_track', 'no_data')
  ),
  constraint performance_scorecard_entries_period_check check (
    period_start <= period_end
  ),
  constraint performance_scorecard_entries_unique_period unique (
    measurable_id,
    period_start,
    period_end
  )
);

create index if not exists performance_scorecard_entries_measurable_idx
  on public.performance_scorecard_entries (measurable_id, period_start desc);
create index if not exists performance_scorecard_entries_period_idx
  on public.performance_scorecard_entries (period_end desc);

comment on table public.performance_scorecard_entries is
  'Append-only scorecard entries. A period is never overwritten; a correction is a new entry with its own notes.';

-- ---------------------------------------------------------------------------
-- 3. Quarterly priorities
-- ---------------------------------------------------------------------------

create table if not exists public.quarterly_priorities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  quarter integer not null,
  year integer not null,
  due_date date,
  status text not null default 'not_started',
  percent_complete integer not null default 0,
  notes text,
  knowledge_item_id uuid references public.knowledge_items (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint quarterly_priorities_title_not_blank check (btrim(title) <> ''),
  constraint quarterly_priorities_quarter_check check (quarter between 1 and 4),
  constraint quarterly_priorities_year_check check (year between 2000 and 2200),
  constraint quarterly_priorities_status_check check (
    status in ('not_started', 'on_track', 'at_risk', 'off_track', 'complete')
  ),
  constraint quarterly_priorities_percent_check check (
    percent_complete between 0 and 100
  )
);

create index if not exists quarterly_priorities_period_idx
  on public.quarterly_priorities (year, quarter);
create index if not exists quarterly_priorities_department_idx
  on public.quarterly_priorities (department_id);
create index if not exists quarterly_priorities_owner_idx
  on public.quarterly_priorities (owner_profile_id);
create index if not exists quarterly_priorities_status_idx
  on public.quarterly_priorities (status);

comment on table public.quarterly_priorities is
  'Quarterly priorities at company, department and individual scope. UI uses plain language; the old rock terminology is not required.';

-- ---------------------------------------------------------------------------
-- 4. Meeting templates, agenda and participants
-- ---------------------------------------------------------------------------

create table if not exists public.meeting_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  meeting_type text not null,
  team_department_id uuid references public.departments (id) on delete set null,
  cadence text not null default 'weekly',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_templates_name_not_blank check (btrim(name) <> ''),
  constraint meeting_templates_type_check check (
    meeting_type in ('leadership', 'department')
  )
);

create index if not exists meeting_templates_type_idx
  on public.meeting_templates (meeting_type, active);
create index if not exists meeting_templates_department_idx
  on public.meeting_templates (team_department_id);

create table if not exists public.meeting_template_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_template_id uuid not null
    references public.meeting_templates (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint meeting_template_participants_unique unique (
    meeting_template_id,
    profile_id
  )
);

create index if not exists meeting_template_participants_template_idx
  on public.meeting_template_participants (meeting_template_id);
create index if not exists meeting_template_participants_profile_idx
  on public.meeting_template_participants (profile_id);

create table if not exists public.meeting_agenda_sections (
  id uuid primary key default gen_random_uuid(),
  meeting_template_id uuid not null
    references public.meeting_templates (id) on delete cascade,
  section_key text not null,
  title text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_agenda_sections_key_check check (
    section_key in ('scorecard', 'priorities', 'headlines', 'actions', 'issues', 'decisions')
  ),
  constraint meeting_agenda_sections_unique_key unique (
    meeting_template_id,
    section_key
  ),
  constraint meeting_agenda_sections_unique_order unique (
    meeting_template_id,
    display_order
  )
);

create index if not exists meeting_agenda_sections_template_idx
  on public.meeting_agenda_sections (meeting_template_id, display_order);

-- ---------------------------------------------------------------------------
-- 5. Meetings, participants and headlines
-- ---------------------------------------------------------------------------

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_template_id uuid
    references public.meeting_templates (id) on delete set null,
  meeting_type text not null,
  team_department_id uuid references public.departments (id) on delete set null,
  meeting_date date not null,
  status text not null default 'scheduled',
  scorecard_review text,
  priority_review text,
  notes text,
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_type_check check (
    meeting_type in ('leadership', 'department')
  ),
  constraint meetings_status_check check (
    status in ('scheduled', 'completed', 'cancelled')
  )
);

create index if not exists meetings_date_idx on public.meetings (meeting_date desc);
create index if not exists meetings_department_idx on public.meetings (team_department_id);
create index if not exists meetings_status_idx on public.meetings (status);

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint meeting_participants_unique unique (meeting_id, profile_id)
);

create index if not exists meeting_participants_meeting_idx
  on public.meeting_participants (meeting_id);
create index if not exists meeting_participants_profile_idx
  on public.meeting_participants (profile_id);

create table if not exists public.meeting_headlines (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings (id) on delete set null,
  title text not null,
  note text,
  type text,
  department_id uuid references public.departments (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint meeting_headlines_title_not_blank check (btrim(title) <> '')
);

create index if not exists meeting_headlines_meeting_idx
  on public.meeting_headlines (meeting_id, created_at);
create index if not exists meeting_headlines_department_idx
  on public.meeting_headlines (department_id);

-- ---------------------------------------------------------------------------
-- 6. Issues and issue discussion notes
-- ---------------------------------------------------------------------------

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department_id uuid references public.departments (id) on delete set null,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  priority text not null default 'normal',
  status text not null default 'open',
  source text not null default 'manual',
  source_id text,
  meeting_id uuid references public.meetings (id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issues_title_not_blank check (btrim(title) <> ''),
  constraint issues_priority_check check (
    priority in ('low', 'normal', 'high', 'critical')
  ),
  constraint issues_status_check check (
    status in ('open', 'discussing', 'resolved', 'closed')
  ),
  constraint issues_source_check check (
    source in ('manual', 'meeting', 'scorecard', 'quarterly_priority', 'review')
  )
);

create index if not exists issues_status_idx on public.issues (status);
create index if not exists issues_department_idx on public.issues (department_id);
create index if not exists issues_owner_idx on public.issues (owner_profile_id);
create index if not exists issues_source_idx on public.issues (source, source_id);
create index if not exists issues_meeting_idx on public.issues (meeting_id);

create table if not exists public.issue_notes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  author_profile_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint issue_notes_body_not_blank check (btrim(body) <> '')
);

create index if not exists issue_notes_issue_idx
  on public.issue_notes (issue_id, created_at);

-- ---------------------------------------------------------------------------
-- 7. Action items and decisions
-- ---------------------------------------------------------------------------

create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_profile_id uuid references public.profiles (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  source text not null default 'manual',
  source_id text,
  meeting_id uuid references public.meetings (id) on delete set null,
  due_date date,
  status text not null default 'open',
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_items_title_not_blank check (btrim(title) <> ''),
  constraint action_items_status_check check (
    status in ('open', 'complete', 'cancelled')
  ),
  constraint action_items_source_check check (
    source in ('manual', 'meeting', 'issue', 'review', 'quarterly_priority')
  )
);

create index if not exists action_items_owner_idx on public.action_items (owner_profile_id);
create index if not exists action_items_due_idx on public.action_items (due_date);
create index if not exists action_items_status_idx on public.action_items (status);
create index if not exists action_items_meeting_idx on public.action_items (meeting_id);
create index if not exists action_items_source_idx on public.action_items (source, source_id);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  decision text not null,
  issue_id uuid references public.issues (id) on delete set null,
  meeting_id uuid references public.meetings (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint decisions_title_not_blank check (btrim(title) <> ''),
  constraint decisions_decision_not_blank check (btrim(decision) <> '')
);

create index if not exists decisions_issue_idx on public.decisions (issue_id);
create index if not exists decisions_meeting_idx on public.decisions (meeting_id);
create index if not exists decisions_department_idx on public.decisions (department_id);
create index if not exists decisions_decided_by_idx on public.decisions (decided_by);

-- ---------------------------------------------------------------------------
-- 8. Employee reviews
-- ---------------------------------------------------------------------------

create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  manager_id uuid references public.profiles (id) on delete set null,
  period_start date,
  period_end date,
  status text not null default 'not_started',
  scheduled_date date,
  completed_date date,
  manager_notes text,
  employee_notes text,
  overall_summary text,
  development_actions text,
  measurable_snapshot_ids uuid[] not null default '{}',
  priority_snapshot_ids uuid[] not null default '{}',
  knowledge_item_snapshot_ids uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_reviews_period_check check (
    period_start is null or period_end is null or period_start <= period_end
  ),
  constraint performance_reviews_status_check check (
    status in ('not_started', 'in_progress', 'employee_input', 'manager_review', 'complete')
  )
);

create index if not exists performance_reviews_employee_idx
  on public.performance_reviews (employee_id);
create index if not exists performance_reviews_manager_idx
  on public.performance_reviews (manager_id);
create index if not exists performance_reviews_status_idx
  on public.performance_reviews (status);

comment on table public.performance_reviews is
  'Employee performance reviews. Numeric scoring is intentionally not introduced unless an existing model already supports it.';

-- ---------------------------------------------------------------------------
-- 9. updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
  targets text[] := array[
    'performance_measurables',
    'quarterly_priorities',
    'meeting_templates',
    'meeting_agenda_sections',
    'meetings',
    'issues',
    'action_items',
    'performance_reviews'
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
  end loop;
end;
$$;

