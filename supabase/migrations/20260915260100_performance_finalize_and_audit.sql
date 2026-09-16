-- Cabinet Genies Portal — Phase 6.1
-- Atomic manager-review finalization, immutable completed reviews, and
-- redacted performance audit events that do not copy private review text.

-- ---------------------------------------------------------------------------
-- 1. Redacted performance audit events
-- ---------------------------------------------------------------------------

create or replace function public.log_performance_redacted_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  entity_type text := tg_argv[0];
  column_name text;
  before_row jsonb;
  after_row jsonb;
  changed_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      entity_type,
      new.id,
      entity_type || '_created',
      actor,
      jsonb_build_object(
        'fields',
        coalesce((
          select array_agg(key order by key)
          from jsonb_object_keys(to_jsonb(new) - 'created_at' - 'updated_at') as key
          where key not in ('created_at', 'updated_at')
        ), '{}'::text[])
      )
    );
    return new;
  end if;

  before_row := to_jsonb(old) - 'created_at' - 'updated_at';
  after_row := to_jsonb(new) - 'created_at' - 'updated_at';

  for column_name in select jsonb_object_keys(after_row)
  loop
    if before_row -> column_name is distinct from after_row -> column_name then
      changed_fields := array_append(changed_fields, column_name);
    end if;
  end loop;

  if cardinality(changed_fields) > 0 then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values (
      entity_type,
      new.id,
      entity_type || '_updated',
      actor,
      jsonb_build_object('changed_fields', changed_fields)
    );
  end if;

  return new;
end;
$$;

revoke all on function public.log_performance_redacted_audit_event() from public;

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
    'performance_reviews',
    'performance_review_manager_notes',
    'department_leaders'
  ];
begin
  foreach target in array targets
  loop
    execute format('drop trigger if exists %I on public.%I', target || '_audit', target);
    execute format(
      'create trigger %I after insert or update on public.%I for each row execute function public.log_performance_redacted_audit_event(%L)',
      target || '_audit',
      target,
      target
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Completed-review integrity constraints and immutable completion
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.performance_reviews'::regclass
      and conname = 'performance_reviews_complete_evidence_check'
  ) then
    alter table public.performance_reviews
      add constraint performance_reviews_complete_evidence_check
      check (
        status <> 'complete'
        or (
          completed_date is not null
          and finalized_by is not null
          and finalized_at is not null
          and snapshot_data is not null
          and jsonb_typeof(snapshot_data) = 'object'
          and snapshot_data ? 'finalized_by'
          and snapshot_data ? 'finalized_at'
          and snapshot_data ? 'employee_id'
          and snapshot_data ? 'manager_id'
          and snapshot_data ? 'evidence'
        )
      )
      not valid;
  end if;
end;
$$;

create or replace function public.protect_performance_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.status = 'complete' then
    raise exception 'Reviews must be created in a non-complete state'
      using errcode = '42501';
  end if;

  if new.completed_date is not null
    or new.finalized_by is not null
    or new.finalized_at is not null
    or (new.snapshot_data is not null and new.snapshot_data <> '{}'::jsonb)
  then
    raise exception 'Completion metadata can only be set by finalization'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_performance_review_insert() from public;

drop trigger if exists performance_reviews_protect_insert on public.performance_reviews;
create trigger performance_reviews_protect_insert
  before insert on public.performance_reviews
  for each row
  execute function public.protect_performance_review_insert();

create or replace function public.protect_performance_review_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.employee_id is distinct from old.employee_id
    or new.manager_id is distinct from old.manager_id
  then
    raise exception 'Reviewer and employee are protected and cannot be changed'
      using errcode = '42501';
  end if;

  if old.status = 'complete' then
    raise exception 'A completed review cannot be changed'
      using errcode = '42501';
  end if;

  if new.employee_id = auth.uid() and not public.current_profile_is_admin() then
    if new.status <> 'employee_input' then
      raise exception 'Employees may submit review input, not change review status'
        using errcode = '42501';
    end if;

    if new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
      or new.scheduled_date is distinct from old.scheduled_date
      or new.completed_date is distinct from old.completed_date
      or new.overall_summary is distinct from old.overall_summary
      or new.development_actions is distinct from old.development_actions
      or new.measurable_snapshot_ids is distinct from old.measurable_snapshot_ids
      or new.priority_snapshot_ids is distinct from old.priority_snapshot_ids
      or new.knowledge_item_snapshot_ids is distinct from old.knowledge_item_snapshot_ids
      or new.snapshot_data is distinct from old.snapshot_data
      or new.finalized_by is distinct from old.finalized_by
      or new.finalized_at is distinct from old.finalized_at
    then
      raise exception 'Employees cannot change protected review fields'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if new.manager_id = auth.uid() and not public.current_profile_is_admin() then
    if new.employee_notes is distinct from old.employee_notes then
      raise exception 'Managers cannot edit employee review input'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if not public.current_profile_is_admin() then
    raise exception 'Not authorized to update this review'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_performance_review_update() from public;

drop trigger if exists performance_reviews_protect_update on public.performance_reviews;
create trigger performance_reviews_protect_update
  before update on public.performance_reviews
  for each row
  execute function public.protect_performance_review_update();

-- Manager notes cannot be changed or deleted after the parent review completes.
create or replace function public.protect_performance_review_manager_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_status text;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select r.status into review_status
  from public.performance_reviews r
  where r.id = coalesce(new.review_id, old.review_id);

  if review_status = 'complete' then
    raise exception 'Manager notes are locked after review completion'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_performance_review_manager_note() from public;

drop trigger if exists performance_review_manager_notes_protect
  on public.performance_review_manager_notes;
create trigger performance_review_manager_notes_protect
  before insert or update or delete on public.performance_review_manager_notes
  for each row
  execute function public.protect_performance_review_manager_note();

-- ---------------------------------------------------------------------------
-- 3. Atomic manager-review save/finalization
-- ---------------------------------------------------------------------------

create or replace function public.save_manager_review(
  p_review_id uuid,
  p_status text,
  p_manager_notes text,
  p_overall_summary text,
  p_development_actions text,
  p_snapshot_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_review public.performance_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_status not in ('not_started', 'in_progress', 'employee_input', 'manager_review', 'complete') then
    raise exception 'Invalid review status'
      using errcode = '22023';
  end if;

  if p_status = 'complete' and (
    p_snapshot_data is null
    or jsonb_typeof(p_snapshot_data) <> 'object'
    or not p_snapshot_data ? 'finalized_by'
    or not p_snapshot_data ? 'finalized_at'
    or not p_snapshot_data ? 'employee_id'
    or not p_snapshot_data ? 'manager_id'
    or not p_snapshot_data ? 'evidence'
  ) then
    raise exception 'Finalization requires a complete evidence snapshot'
      using errcode = '22023';
  end if;

  select *
    into v_review
    from public.performance_reviews
    where id = p_review_id
    for update;

  if not found then
    raise exception 'Review not found'
      using errcode = 'P0002';
  end if;

  if v_review.status = 'complete' then
    raise exception 'A completed review cannot be changed'
      using errcode = '42501';
  end if;

  if not public.current_profile_is_admin() then
    if v_review.manager_id is distinct from auth.uid() then
      raise exception 'Only the assigned manager or an administrator can save this review'
        using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active
    ) then
      raise exception 'Active manager profile required'
        using errcode = '42501';
    end if;
  end if;

  update public.performance_reviews
  set status = p_status,
      overall_summary = p_overall_summary,
      development_actions = p_development_actions,
      completed_date = case when p_status = 'complete' then now() else null end,
      finalized_by = case when p_status = 'complete' then auth.uid() else null end,
      finalized_at = case when p_status = 'complete' then now() else null end,
      snapshot_data = case when p_status = 'complete' then p_snapshot_data else v_review.snapshot_data end
  where id = p_review_id;

  if p_manager_notes is not null and btrim(p_manager_notes) <> '' then
    insert into public.performance_review_manager_notes (review_id, body, updated_by)
    values (p_review_id, p_manager_notes, auth.uid())
    on conflict (review_id) do update
      set body = excluded.body,
          updated_by = excluded.updated_by,
          updated_at = now();
  else
    delete from public.performance_review_manager_notes
    where review_id = p_review_id;
  end if;

  return true;
end;
$$;

revoke all on function public.save_manager_review(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.save_manager_review(uuid, text, text, text, text, jsonb) to authenticated;
