\set ON_ERROR_STOP on

-- These assertions exercise RLS as the named authenticated profiles. They are
-- deliberately written with `raise exception` on failure so an isolated CI or
-- local database fails loudly instead of returning an empty result set.

begin;

-- Reuse the request JWT claim so auth.uid() resolves to the selected profile.
create or replace function public.set_test_profile(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', profile_id)::text, true);
end;
$$;

-- Unrelated employees cannot read a review they are not part of.
set local role authenticated;
select public.set_test_profile(:'other_id'::uuid);
do $$
declare
  visible integer;
begin
  select count(*) into visible
  from public.performance_reviews
  where employee_id = :'employee_id'::uuid
     or manager_id = :'manager_id'::uuid;

  if visible > 0 then
    raise exception 'unrelated employee can read another employee review';
  end if;
end;
$$;

-- A manager can see the review, but the private manager-note table is not
-- visible to the employee.
select public.set_test_profile(:'employee_id'::uuid);
do $$
declare
  private_notes integer;
begin
  select count(*) into private_notes
  from public.performance_review_manager_notes mn
  join public.performance_reviews r on r.id = mn.review_id
  where r.employee_id = :'employee_id'::uuid;

  if private_notes > 0 then
    raise exception 'employee can read private manager review notes';
  end if;
end;
$$;

-- Meeting participant visibility does not recurse and unrelated users see none.
select public.set_test_profile(:'other_id'::uuid);
do $$
declare
  visible_meetings integer;
begin
  select count(*) into visible_meetings
  from public.meetings m
  where exists (
    select 1
    from public.meeting_participants mp
    where mp.meeting_id = m.id
      and mp.profile_id = :'employee_id'::uuid
  );

  if visible_meetings > 0 then
    raise exception 'unrelated employee can see a meeting they do not attend';
  end if;
end;
$$;

rollback;

