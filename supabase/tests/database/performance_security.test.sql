begin;

select plan(19);

create temp table fixture_ids (
  kind text primary key,
  id uuid not null
);

insert into fixture_ids (kind, id) values
  ('admin', '11111111-1111-4111-8111-111111111111'),
  ('manager', '22222222-2222-4222-8222-222222222222'),
  ('employee', '33333333-3333-4333-8333-333333333333'),
  ('other', '44444444-4444-4444-8444-444444444444'),
  ('accounting', '55555555-5555-4555-8555-555555555555'),
  ('inactive', '66666666-6666-4666-8666-666666666666'),
  ('leader', '77777777-7777-4777-8777-777777777777'),
  ('review', '88888888-8888-4888-8888-888888888888'),
  ('meeting', '99999999-9999-4999-8999-999999999999');

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  kind || '@example.test',
  'not-a-real-password',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
from fixture_ids
where kind in ('admin', 'manager', 'employee', 'other', 'accounting', 'inactive', 'leader');

-- Fixture setup only: temporarily disable the profile privilege guard so the
-- test can establish users with different authorization states. The trigger is
-- immediately restored before any security assertions run.
alter table public.profiles disable trigger profiles_protect_privileged_columns;

update public.profiles
set role = 'admin', active = true
where id = (select id from fixture_ids where kind = 'admin');

update public.profiles
set role = 'supervisor', active = true
where id = (select id from fixture_ids where kind = 'manager');

update public.profiles
set role = 'employee',
    active = true,
    manager_id = (select id from fixture_ids where kind = 'manager')
where id = (select id from fixture_ids where kind = 'employee');

update public.profiles
set role = 'employee', active = true
where id = (select id from fixture_ids where kind = 'other');

update public.profiles
set role = 'accounting', active = true
where id = (select id from fixture_ids where kind = 'accounting');

update public.profiles
set role = 'employee', active = false
where id = (select id from fixture_ids where kind = 'inactive');

update public.profiles
set role = 'supervisor',
    active = true,
    business_role_id = (
      select id
      from public.business_roles
      where key = 'sales_leader'
    )
where id = (select id from fixture_ids where kind = 'leader');

alter table public.profiles enable trigger profiles_protect_privileged_columns;
business_role_id = (select id from public.business_roles where key = 'sales_leader')
  where id = (select id from fixture_ids where kind = 'leader');

insert into public.departments (slug, name, display_order)
values ('test-dept', 'Test Department', 500)
on conflict (slug) do nothing;

insert into public.performance_reviews (
  id,
  employee_id,
  manager_id,
  period_start,
  period_end,
  status,
  scheduled_date,
  created_by
)
select
  id,
  employee.id,
  manager.id,
  '2026-06-01',
  '2026-06-30',
  'in_progress',
  '2026-06-30',
  manager.id
from fixture_ids
cross join fixture_ids employee
cross join fixture_ids manager
where fixture_ids.kind = 'review'
  and employee.kind = 'employee'
  and manager.kind = 'manager';

insert into public.performance_review_manager_notes (review_id, body, updated_by)
select
  (select id from fixture_ids where kind = 'review'),
  'SECRET_MANAGER_DRAFT',
  (select id from fixture_ids where kind = 'manager');

insert into public.meetings (id, meeting_type, meeting_date, created_by)
select id, 'leadership', '2026-06-15', (select id from fixture_ids where kind = 'manager')
from fixture_ids where kind = 'meeting';

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

-- 1. fixtures exist
select ok(
  (select count(*) = 7 from public.profiles where id in (select id from fixture_ids where kind in ('admin','manager','employee','other','accounting','inactive','leader'))),
  'fixtures exist'
);

-- 2. employee sees shared review
select public.set_test_profile((select id from fixture_ids where kind = 'employee'));
set local role authenticated;
select is(
  (select count(*) from public.performance_reviews where id = (select id from fixture_ids where kind = 'review')),
  1,
  'employee can read the permitted review'
);

-- 3. employee cannot read private manager notes
select is(
  (select count(*) from public.performance_review_manager_notes where review_id = (select id from fixture_ids where kind = 'review')),
  0,
  'employee cannot read private manager notes'
);
reset role;

-- 4. manager sees private notes
select public.set_test_profile((select id from fixture_ids where kind = 'manager'));
set local role authenticated;
select is(
  (select count(*) from public.performance_review_manager_notes where review_id = (select id from fixture_ids where kind = 'review')),
  1,
  'manager can read private notes'
);

-- 5. unrelated employee cannot see review
select public.set_test_profile((select id from fixture_ids where kind = 'other'));
select is(
  (select count(*) from public.performance_reviews where id = (select id from fixture_ids where kind = 'review')),
  0,
  'unrelated employee cannot read review'
);

-- 6. accounting cannot recover private text from audit log
select public.set_test_profile((select id from fixture_ids where kind = 'accounting'));
select ok(
  not exists (
    select 1
    from public.audit_events
    where entity_type = 'performance_review_manager_note'
      and metadata::text like '%SECRET_MANAGER_DRAFT%'
  ),
  'private manager note text is redacted from audit log'
);
reset role;

-- 7. manager cannot create review for non-report
select public.set_test_profile((select id from fixture_ids where kind = 'manager'));
set local role authenticated;
select throws_ok(
  $$insert into public.performance_reviews (employee_id, manager_id, status) values ((select id from fixture_ids where kind = 'other'), (select id from fixture_ids where kind = 'manager'), 'not_started')$$,
  '42501',
  'manager cannot create review for a non-report'
);

-- 8. employee cannot finalize
select public.set_test_profile((select id from fixture_ids where kind = 'employee'));
select throws_ok(
  $$select public.save_manager_review(
    (select id from fixture_ids where kind = 'review'),
    'complete',
    null,
    null,
    null,
    '{"finalized_by":"employee","finalized_at":"2026-06-30T00:00:00Z","employee_id":"employee","manager_id":"manager","evidence":{}}'::jsonb
  )$$,
  '42501',
  'employee cannot finalize'
);
reset role;

-- 9. failed finalization leaves no partial state
select public.set_test_profile((select id from fixture_ids where kind = 'manager'));
set local role authenticated;
select throws_ok(
  $$select public.save_manager_review(
    (select id from fixture_ids where kind = 'review'),
    'complete',
    null,
    null,
    null,
    null
  )$$,
  '22023',
  'incomplete snapshot is rejected'
);
select is(
  (select status from public.performance_reviews where id = (select id from fixture_ids where kind = 'review')),
  'in_progress',
  'failed finalization did not change review status'
);
reset role;

-- 10. successful finalization and immutable completion
select public.set_test_profile((select id from fixture_ids where kind = 'manager'));
set local role authenticated;
select lives_ok(
  $$select public.save_manager_review(
    (select id from fixture_ids where kind = 'review'),
    'complete',
    'MANAGER_FINAL_NOTE',
    'Reviewed.',
    'Continue development.',
    '{"finalized_by":"manager","finalized_at":"2026-06-30T00:00:00Z","employee_id":"employee","manager_id":"manager","evidence":{"role_expectations":[],"measurables":[],"priorities":[]}}'::jsonb
  )$$,
  'manager can finalize with valid evidence'
);
select throws_ok(
  $$delete from public.performance_review_manager_notes where review_id = (select id from fixture_ids where kind = 'review')$$,
  '42501',
  'completed review notes are immutable'
);
reset role;

-- 11. participant can read meeting; unrelated cannot
select public.set_test_profile((select id from fixture_ids where kind = 'manager'));
set local role authenticated;
select lives_ok(
  $$insert into public.meeting_participants (meeting_id, profile_id) values ((select id from fixture_ids where kind = 'meeting'), (select id from fixture_ids where kind = 'employee'))$$,
  'organizer can add participant'
);
reset role;

select public.set_test_profile((select id from fixture_ids where kind = 'employee'));
set local role authenticated;
select is(
  (select count(*) from public.meetings where id = (select id from fixture_ids where kind = 'meeting')),
  1,
  'participant can read their meeting'
);
reset role;

select public.set_test_profile((select id from fixture_ids where kind = 'other'));
set local role authenticated;
select is(
  (select count(*) from public.meetings where id = (select id from fixture_ids where kind = 'meeting')),
  0,
  'unrelated employee cannot read meeting'
);
reset role;

-- 12. business role alone grants no department access
select public.set_test_profile((select id from fixture_ids where kind = 'leader'));
set local role authenticated;
select is(
  (
    select count(*)
    from public.performance_measurables
    where department_id = (select id from public.departments where slug = 'test-dept')
  ),
  0,
  'business role alone grants no department data'
);
reset role;

-- 13. explicit department leadership works
insert into public.department_leaders (department_id, profile_id, created_by)
select
  (select id from public.departments where slug = 'test-dept'),
  (select id from fixture_ids where kind = 'leader'),
  (select id from fixture_ids where kind = 'admin');

insert into public.performance_measurables (name, scope, department_id, target, status, created_by)
select 'Department measurable', 'department', (select id from public.departments where slug = 'test-dept'), 10, 'on_track', (select id from fixture_ids where kind = 'admin');

select public.set_test_profile((select id from fixture_ids where kind = 'leader'));
set local role authenticated;
select is(
  (
    select count(*)
    from public.performance_measurables
    where department_id = (select id from public.departments where slug = 'test-dept')
  ),
  1,
  'explicit department leader can read department data'
);
reset role;

-- 14. inactive user denied
select public.set_test_profile((select id from fixture_ids where kind = 'inactive'));
set local role authenticated;
select is(
  (select count(*) from public.performance_reviews where id = (select id from fixture_ids where kind = 'review')),
  0,
  'inactive user is denied'
);
reset role;

-- 15. anonymous access denied
set local role anon;
select throws_ok(
  $$select count(*) from public.performance_reviews where id = (select id from fixture_ids where kind = 'review')$$,
  '42501',
  'anonymous access is denied'
);
reset role;

-- 16. meeting participant removed loses access
select public.set_test_profile((select id from fixture_ids where kind = 'manager'));
set local role authenticated;
select lives_ok(
  $$delete from public.meeting_participants where meeting_id = (select id from fixture_ids where kind = 'meeting') and profile_id = (select id from fixture_ids where kind = 'employee')$$,
  'organizer can remove participant'
);
reset role;

select public.set_test_profile((select id from fixture_ids where kind = 'employee'));
set local role authenticated;
select is(
  (select count(*) from public.meetings where id = (select id from fixture_ids where kind = 'meeting')),
  0,
  'removed participant loses meeting access'
);
reset role;

select * from finish();
rollback;
