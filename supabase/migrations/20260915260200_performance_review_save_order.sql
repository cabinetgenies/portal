-- Cabinet Genies Portal — Phase 6.1
-- Correct the manager-review save/finalization order.
--
-- The previous implementation finalized `performance_reviews` before writing the
-- private manager note. `protect_performance_review_manager_note()` correctly
-- locks manager-note changes once the parent review is complete, so finalizing a
-- review that also saves a manager note blocked itself.
--
-- This migration is additive: it replaces only the SECURITY DEFINER helper, does
-- not alter existing event/history rows, and keeps completed reviews immutable.

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

  -- Save, update or delete the private manager note while the parent review is
  -- still non-complete. Finalization below is deliberately last, so the
  -- immutable-after-completion guard accepts this write and the whole operation
  -- remains atomic.
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

  update public.performance_reviews
  set status = p_status,
      overall_summary = p_overall_summary,
      development_actions = p_development_actions,
      completed_date = case when p_status = 'complete' then now() else null end,
      finalized_by = case when p_status = 'complete' then auth.uid() else null end,
      finalized_at = case when p_status = 'complete' then now() else null end,
      snapshot_data = case when p_status = 'complete' then p_snapshot_data else v_review.snapshot_data end
  where id = p_review_id;

  return true;
end;
$$;

revoke all on function public.save_manager_review(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.save_manager_review(uuid, text, text, text, text, jsonb) to authenticated;

