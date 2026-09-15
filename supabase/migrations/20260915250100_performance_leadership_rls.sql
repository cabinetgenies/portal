-- Cabinet Genies Portal — Phase 6
-- Row Level Security for the Performance & Leadership tables.
--
-- Access follows the existing security model rather than relying on hidden UI:
--   employee    : own measurables, priorities, actions, issues and reviews
--   manager     : direct reports (public.manages_profile)
--   department
--     leader    : the department's leadership/team data
--   admin / ceo : company-wide, including configuration and company records
--
-- A "department leader" here is a profile whose primary business role is one of
-- sales_leader, project_manager or field_manager and whose primary department is
-- the row's department. CEO and Admin are handled separately as company-wide.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_department_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.department_id
  from public.profiles p
  where p.id = auth.uid()
    and p.active;
$$;

revoke all on function public.current_profile_department_id() from public;
grant execute on function public.current_profile_department_id() to authenticated;

create or replace function public.current_profile_leads_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.business_roles br on br.id = p.business_role_id
    where p.id = auth.uid()
      and p.active
      and p.department_id = target_department_id
      and br.key in ('sales_leader', 'project_manager', 'field_manager')
  );
$$;

revoke all on function public.current_profile_leads_department(uuid) from public;
grant execute on function public.current_profile_leads_department(uuid) to authenticated;

create or replace function public.can_view_performance_employee(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    target_profile_id = auth.uid()
    or public.manages_profile(target_profile_id)
    or public.current_profile_is_admin()
  );
$$;

revoke all on function public.can_view_performance_employee(uuid) from public;
grant execute on function public.can_view_performance_employee(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Scorecard measurables
-- ---------------------------------------------------------------------------

alter table public.performance_measurables enable row level security;

revoke all on table public.performance_measurables from anon;
grant select, insert, update, delete on table public.performance_measurables to authenticated;

drop policy if exists "Measurables are visible to their performance audience"
  on public.performance_measurables;
create policy "Measurables are visible to their performance audience"
  on public.performance_measurables
  for select
  to authenticated
  using (
    (scope = 'employee' and (
      public.can_view_performance_employee(coalesce(employee_id, owner_profile_id))
    ))
    or (scope = 'department' and (
      public.current_profile_is_admin()
      or public.current_profile_leads_department(department_id)
    ))
    or (scope = 'company' and public.current_profile_is_admin())
  );

drop policy if exists "Measurables are managed by administrators"
  on public.performance_measurables;
create policy "Measurables are managed by administrators"
  on public.performance_measurables
  for all
  to authenticated
  using (public.current_profile_is_admin())
  with check (public.current_profile_is_admin());

-- ---------------------------------------------------------------------------
-- 2. Scorecard entries
-- ---------------------------------------------------------------------------

alter table public.performance_scorecard_entries enable row level security;

revoke all on table public.performance_scorecard_entries from anon;
grant select, insert on table public.performance_scorecard_entries to authenticated;

drop policy if exists "Scorecard entries are visible to their measurable audience"
  on public.performance_scorecard_entries;
create policy "Scorecard entries are visible to their measurable audience"
  on public.performance_scorecard_entries
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.performance_measurables m
      where m.id = measurable_id
        and (
          (m.scope = 'employee' and
            public.can_view_performance_employee(coalesce(m.employee_id, m.owner_profile_id)))
          or (m.scope = 'department' and (
            public.current_profile_is_admin()
            or public.current_profile_leads_department(m.department_id)
          ))
          or (m.scope = 'company' and public.current_profile_is_admin())
        )
    )
  );

drop policy if exists "Scorecard entries are recorded by administrators"
  on public.performance_scorecard_entries;
create policy "Scorecard entries are recorded by administrators"
  on public.performance_scorecard_entries
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    and entered_by = auth.uid()
  );

-- Append-only: no UPDATE and no DELETE policies.

-- ---------------------------------------------------------------------------
-- 3. Quarterly priorities
-- ---------------------------------------------------------------------------

alter table public.quarterly_priorities enable row level security;

revoke all on table public.quarterly_priorities from anon;
grant select, insert, update on table public.quarterly_priorities to authenticated;

drop policy if exists "Priorities are visible to their performance audience"
  on public.quarterly_priorities;
create policy "Priorities are visible to their performance audience"
  on public.quarterly_priorities
  for select
  to authenticated
  using (
    (owner_profile_id = auth.uid())
    or public.can_view_performance_employee(owner_profile_id)
    or (department_id is not null and (
      public.current_profile_is_admin()
      or public.current_profile_leads_department(department_id)
    ))
    or (department_id is null and public.current_profile_is_admin())
  );

drop policy if exists "Priorities are created by administrators and department leaders"
  on public.quarterly_priorities;
create policy "Priorities are created by administrators and department leaders"
  on public.quarterly_priorities
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

drop policy if exists "Priorities are updated by owners and administrators"
  on public.quarterly_priorities;
create policy "Priorities are updated by owners and administrators"
  on public.quarterly_priorities
  for update
  to authenticated
  using (
    public.current_profile_is_admin()
    or owner_profile_id = auth.uid()
  )
  with check (
    public.current_profile_is_admin()
    or owner_profile_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 4. Meeting templates and agenda (configuration)
-- ---------------------------------------------------------------------------

alter table public.meeting_templates enable row level security;
revoke all on table public.meeting_templates from anon;
grant select, insert, update, delete on table public.meeting_templates to authenticated;

drop policy if exists "Meeting templates are readable by portal users"
  on public.meeting_templates;
create policy "Meeting templates are readable by portal users"
  on public.meeting_templates
  for select
  to authenticated
  using (true);

drop policy if exists "Meeting templates are managed by administrators"
  on public.meeting_templates;
create policy "Meeting templates are managed by administrators"
  on public.meeting_templates
  for all
  to authenticated
  using (public.current_profile_is_admin())
  with check (public.current_profile_is_admin());

alter table public.meeting_template_participants enable row level security;
revoke all on table public.meeting_template_participants from anon;
grant select on table public.meeting_template_participants to authenticated;

drop policy if exists "Meeting template participants are readable by portal users"
  on public.meeting_template_participants;
create policy "Meeting template participants are readable by portal users"
  on public.meeting_template_participants
  for select
  to authenticated
  using (true);

alter table public.meeting_agenda_sections enable row level security;
revoke all on table public.meeting_agenda_sections from anon;
grant select on table public.meeting_agenda_sections to authenticated;

drop policy if exists "Meeting agenda is readable by portal users"
  on public.meeting_agenda_sections;
create policy "Meeting agenda is readable by portal users"
  on public.meeting_agenda_sections
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 5. Meetings, participants and headlines
-- ---------------------------------------------------------------------------

alter table public.meetings enable row level security;
revoke all on table public.meetings from anon;
grant select, insert, update on table public.meetings to authenticated;

drop policy if exists "Meetings are visible to leaders, participants and administrators"
  on public.meetings;
create policy "Meetings are visible to leaders, participants and administrators"
  on public.meetings
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or (
      team_department_id is not null
      and public.current_profile_leads_department(team_department_id)
    )
    or exists (
      select 1
      from public.meeting_participants mp
      where mp.meeting_id = meetings.id
        and mp.profile_id = auth.uid()
    )
  );

drop policy if exists "Meetings are created by administrators and department leaders"
  on public.meetings;
create policy "Meetings are created by administrators and department leaders"
  on public.meetings
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    or (
      team_department_id is not null
      and public.current_profile_leads_department(team_department_id)
    )
  );

drop policy if exists "Meetings are updated by administrators and department leaders"
  on public.meetings;
create policy "Meetings are updated by administrators and department leaders"
  on public.meetings
  for update
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or (
      team_department_id is not null
      and public.current_profile_leads_department(team_department_id)
    )
  )
  with check (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or (
      team_department_id is not null
      and public.current_profile_leads_department(team_department_id)
    )
  );

alter table public.meeting_participants enable row level security;
revoke all on table public.meeting_participants from anon;
grant select on table public.meeting_participants to authenticated;

drop policy if exists "Meeting participants are visible to meeting audience"
  on public.meeting_participants;
create policy "Meeting participants are visible to meeting audience"
  on public.meeting_participants
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meetings m
      where m.id = meeting_id
        and (
          public.current_profile_is_admin()
          or m.created_by = auth.uid()
          or (
            m.team_department_id is not null
            and public.current_profile_leads_department(m.team_department_id)
          )
          or exists (
            select 1
            from public.meeting_participants inner_participant
            where inner_participant.meeting_id = m.id
              and inner_participant.profile_id = auth.uid()
          )
        )
    )
  );

alter table public.meeting_headlines enable row level security;
revoke all on table public.meeting_headlines from anon;
grant select, insert on table public.meeting_headlines to authenticated;

drop policy if exists "Headlines are visible to meeting audience and department leaders"
  on public.meeting_headlines;
create policy "Headlines are visible to meeting audience and department leaders"
  on public.meeting_headlines
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
    or (
      meeting_id is not null
      and exists (
        select 1
        from public.meetings m
        where m.id = meeting_headlines.meeting_id
          and (
            m.created_by = auth.uid()
            or (
              m.team_department_id is not null
              and public.current_profile_leads_department(m.team_department_id)
            )
            or exists (
              select 1
              from public.meeting_participants mp
              where mp.meeting_id = m.id
                and mp.profile_id = auth.uid()
            )
          )
      )
    )
  );

drop policy if exists "Headlines are created by meeting leaders and administrators"
  on public.meeting_headlines;
create policy "Headlines are created by meeting leaders and administrators"
  on public.meeting_headlines
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    and created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 6. Issues and issue notes
-- ---------------------------------------------------------------------------

alter table public.issues enable row level security;
revoke all on table public.issues from anon;
grant select, insert, update on table public.issues to authenticated;

drop policy if exists "Issues are visible to owners, leaders and administrators"
  on public.issues;
create policy "Issues are visible to owners, leaders and administrators"
  on public.issues
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or owner_profile_id = auth.uid()
    or public.manages_profile(owner_profile_id)
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

drop policy if exists "Issues are created by administrators and department leaders"
  on public.issues;
create policy "Issues are created by administrators and department leaders"
  on public.issues
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

drop policy if exists "Issues are updated by owners, leaders and administrators"
  on public.issues;
create policy "Issues are updated by owners, leaders and administrators"
  on public.issues
  for update
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or owner_profile_id = auth.uid()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  )
  with check (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or owner_profile_id = auth.uid()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

alter table public.issue_notes enable row level security;
revoke all on table public.issue_notes from anon;
grant select, insert on table public.issue_notes to authenticated;

drop policy if exists "Issue notes are visible to the issue audience"
  on public.issue_notes;
create policy "Issue notes are visible to the issue audience"
  on public.issue_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.issues i
      where i.id = issue_id
        and (
          public.current_profile_is_admin()
          or i.created_by = auth.uid()
          or i.owner_profile_id = auth.uid()
          or public.manages_profile(i.owner_profile_id)
          or (
            i.department_id is not null
            and public.current_profile_leads_department(i.department_id)
          )
        )
    )
  );

drop policy if exists "Issue notes are created by administrators and department leaders"
  on public.issue_notes;
create policy "Issue notes are created by administrators and department leaders"
  on public.issue_notes
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    and author_profile_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 7. Action items
-- ---------------------------------------------------------------------------

alter table public.action_items enable row level security;
revoke all on table public.action_items from anon;
grant select, insert, update on table public.action_items to authenticated;

drop policy if exists "Action items are visible to owners, leaders and administrators"
  on public.action_items;
create policy "Action items are visible to owners, leaders and administrators"
  on public.action_items
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or created_by = auth.uid()
    or owner_profile_id = auth.uid()
    or public.manages_profile(owner_profile_id)
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

drop policy if exists "Action items are created by administrators and department leaders"
  on public.action_items;
create policy "Action items are created by administrators and department leaders"
  on public.action_items
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

drop policy if exists "Action items are updated by owners and administrators"
  on public.action_items;
create policy "Action items are updated by owners and administrators"
  on public.action_items
  for update
  to authenticated
  using (
    public.current_profile_is_admin()
    or owner_profile_id = auth.uid()
  )
  with check (
    public.current_profile_is_admin()
    or owner_profile_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 8. Decisions
-- ---------------------------------------------------------------------------

alter table public.decisions enable row level security;
revoke all on table public.decisions from anon;
grant select, insert on table public.decisions to authenticated;

drop policy if exists "Decisions are visible to leaders, deciders and administrators"
  on public.decisions;
create policy "Decisions are visible to leaders, deciders and administrators"
  on public.decisions
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or decided_by = auth.uid()
    or (
      department_id is not null
      and public.current_profile_leads_department(department_id)
    )
  );

drop policy if exists "Decisions are recorded by administrators and department leaders"
  on public.decisions;
create policy "Decisions are recorded by administrators and department leaders"
  on public.decisions
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    and decided_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 9. Performance reviews
-- ---------------------------------------------------------------------------

alter table public.performance_reviews enable row level security;
revoke all on table public.performance_reviews from anon;
grant select, insert, update on table public.performance_reviews to authenticated;

drop policy if exists "Reviews are visible to employee, manager and administrators"
  on public.performance_reviews;
create policy "Reviews are visible to employee, manager and administrators"
  on public.performance_reviews
  for select
  to authenticated
  using (
    public.current_profile_is_admin()
    or employee_id = auth.uid()
    or manager_id = auth.uid()
  );

drop policy if exists "Reviews are created by managers and administrators"
  on public.performance_reviews;
create policy "Reviews are created by managers and administrators"
  on public.performance_reviews
  for insert
  to authenticated
  with check (
    public.current_profile_is_admin()
    or manager_id = auth.uid()
  );

drop policy if exists "Reviews are updated by employee, manager and administrators"
  on public.performance_reviews;
create policy "Reviews are updated by employee, manager and administrators"
  on public.performance_reviews
  for update
  to authenticated
  using (
    public.current_profile_is_admin()
    or employee_id = auth.uid()
    or manager_id = auth.uid()
  )
  with check (
    public.current_profile_is_admin()
    or employee_id = auth.uid()
    or manager_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 10. Audit triggers
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
  targets text[] := array[
    'performance_measurables',
    'performance_scorecard_entries',
    'quarterly_priorities',
    'meeting_templates',
    'meeting_template_participants',
    'meeting_agenda_sections',
    'meetings',
    'meeting_participants',
    'meeting_headlines',
    'issues',
    'issue_notes',
    'action_items',
    'decisions',
    'performance_reviews'
  ];
begin
  foreach target in array targets
  loop
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

