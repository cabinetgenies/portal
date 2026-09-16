begin;

select plan(26);

-- ---------------------------------------------------------------------------
-- Fixed fixtures. The test never reads a temporary helper table after switching
-- into `authenticated` or `anon`; every authorization assertion uses literals.
-- ---------------------------------------------------------------------------

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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'admin@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'manager@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'employee@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'other@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'accounting@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '66666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'inactive@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '77777777-7777-4777-8777-777777777777',
    'authenticated',
    'authenticated',
    'leader@example.test',
    'not-a-real-password',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

-- Fixture setup only: the profile privilege guard is temporarily disabled so the
-- test can establish roles, reporting lines and active states. It is re-enabled
-- before any authorization assertion runs.
alter table public.profiles
disable trigger profiles_protect_privileged_columns;

update public.profiles
set role = 'admin',
    active = true
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles
set role = 'supervisor',
    active = true
where id = '22222222-2222-4222-8222-222222222222';

update public.profiles
set role = 'employee',
    active = true,
    manager_id = '22222222-2222-4222-8222-222222222222'
where id = '33333333-3333-4333-8333-333333333333';

update public.profiles
set role = 'employee',
    active = true
where id = '44444444-4444-4444-8444-444444444444';

update public.profiles
set role = 'accounting',
    active = true
where id = '55555555-5555-4555-8555-555555555555';

update public.profiles
set role = 'admin',
    active = false
where id = '66666666-6666-4666-8666-666666666666';

update public.profiles
set role = 'supervisor',
    active = true,
    business_role_id = (
      select id
      from public.business_roles
      where key = 'sales_leader'
    )
where id = '77777777-7777-4777-8777-777777777777';

alter table public.profiles
enable trigger profiles_protect_privileged_columns;

insert into public.departments (
  id,
  slug,
  name,
  display_order
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'test-dept',
  'Test Department',
  500
);

insert into public.performance_measurables (
  name,
  scope,
  department_id,
  target,
  status,
  created_by
)
values (
  'Department measurable',
  'department',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  10,
  'on_track',
  '11111111-1111-4111-8111-111111111111'
);

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
values (
  '88888888-8888-4888-8888-888888888888',
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '2026-06-01',
  '2026-06-30',
  'in_progress',
  '2026-06-30',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.performance_review_manager_notes (
  review_id,
  body,
  updated_by
)
values (
  '88888888-8888-4888-8888-888888888888',
  'SECRET_MANAGER_DRAFT',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.meetings (
  id,
  meeting_type,
  meeting_date,
  created_by
)
values (
  '99999999-9999-4999-8999-999999999999',
  'leadership',
  '2026-06-15',
  '22222222-2222-4222-8222-222222222222'
);

create or replace function public.set_test_profile(profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', profile_id)::text,
    true
  );
end;
$$;

-- 1. Fixture profiles exist.
select ok(
  (
    select count(*) = 7
    from public.profiles
    where id in (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777'
    )
  ),
  'fixture profiles exist'
);

-- 2. Employee can read their own review.
select public.set_test_profile('33333333-3333-4333-8333-333333333333');
set local role authenticated;

select is(
  (
    select count(*)
    from public.performance_reviews
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  1::bigint,
  'employee can read their own review'
);

-- 3. Employee cannot read private manager notes.
select is(
  (
    select count(*)
    from public.performance_review_manager_notes
    where review_id = '88888888-8888-4888-8888-888888888888'
  ),
  0::bigint,
  'employee cannot read private manager notes'
);

reset role;

-- 4. auth.uid resolves to the intended profile after role switch.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select ok(
  auth.uid() = '22222222-2222-4222-8222-222222222222'::uuid,
  'auth.uid resolves to the intended authenticated profile'
);

-- 5. Assigned manager can read manager notes.
select is(
  (
    select count(*)
    from public.performance_review_manager_notes
    where review_id = '88888888-8888-4888-8888-888888888888'
  ),
  1::bigint,
  'assigned manager can read manager notes'
);

reset role;

-- 6. Unrelated employee cannot read the review.
select public.set_test_profile('44444444-4444-4444-8444-444444444444');
set local role authenticated;

select is(
  (
    select count(*)
    from public.performance_reviews
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  0::bigint,
  'unrelated employee cannot read the review'
);

reset role;

-- 7. Private manager-note text is not present in audit metadata.
select public.set_test_profile('55555555-5555-4555-8555-555555555555');
set local role authenticated;

select ok(
  not exists (
    select 1
    from public.audit_events
    where metadata::text like '%SECRET_MANAGER_DRAFT%'
  ),
  'private manager-note text is redacted from audit metadata'
);

reset role;

-- 8. Manager cannot create a review for a non-report.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select throws_ok(
  $$
    insert into public.performance_reviews (
      employee_id,
      manager_id,
      status
    )
    values (
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      'not_started'
    )
  $$,
  '42501',
  null,
  'manager cannot create a review for a non-report'
);

reset role;

-- 9. Employee cannot finalize.
select public.set_test_profile('33333333-3333-4333-8333-333333333333');
set local role authenticated;

select throws_ok(
  $$
    select public.save_manager_review(
      '88888888-8888-4888-8888-888888888888',
      'complete',
      null,
      null,
      null,
      '{
        "finalized_by":"employee",
        "finalized_at":"2026-06-30T00:00:00Z",
        "employee_id":"employee",
        "manager_id":"manager",
        "evidence":{}
      }'::jsonb
    )
  $$,
  '42501',
  null,
  'employee cannot finalize'
);

reset role;

-- 10. Invalid/incomplete finalization snapshot is rejected.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select throws_ok(
  $$
    select public.save_manager_review(
      '88888888-8888-4888-8888-888888888888',
      'complete',
      null,
      null,
      null,
      null
    )
  $$,
  '22023',
  null,
  'incomplete finalization snapshot is rejected'
);

-- 11. Failed finalization leaves the review unchanged.
select is(
  (
    select status
    from public.performance_reviews
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  'in_progress',
  'failed finalization leaves review unchanged'
);

reset role;

-- 12. Assigned manager can successfully finalize with manager notes.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select lives_ok(
  $$
    select public.save_manager_review(
      '88888888-8888-4888-8888-888888888888',
      'complete',
      'MANAGER_FINAL_NOTE',
      'Reviewed.',
      'Continue development.',
      '{
        "finalized_by":"manager",
        "finalized_at":"2026-06-30T00:00:00Z",
        "employee_id":"employee",
        "manager_id":"manager",
        "evidence":{
          "role_expectations":[],
          "measurables":[],
          "priorities":[]
        }
      }'::jsonb
    )
  $$,
  'assigned manager can finalize with manager notes'
);

-- 13. Finalized review is complete.
select is(
  (
    select status
    from public.performance_reviews
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  'complete',
  'finalized review is complete'
);

-- 14. Finalized evidence snapshot exists.
select ok(
  (
    select jsonb_typeof(snapshot_data) = 'object'
      and snapshot_data ? 'finalized_by'
      and snapshot_data ? 'finalized_at'
      and snapshot_data ? 'employee_id'
      and snapshot_data ? 'manager_id'
      and snapshot_data ? 'evidence'
    from public.performance_reviews
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  'finalized evidence snapshot exists'
);

reset role;

-- 15. Completed review cannot be edited.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select throws_ok(
  $$
    update public.performance_reviews
    set status = 'in_progress'
    where id = '88888888-8888-4888-8888-888888888888'
  $$,
  '42501',
  null,
  'completed review cannot be edited'
);

-- 16. Completed manager notes cannot be updated.
select throws_ok(
  $$
    update public.performance_review_manager_notes
    set body = 'CHANGED'
    where review_id = '88888888-8888-4888-8888-888888888888'
  $$,
  '42501',
  null,
  'completed manager notes cannot be updated'
);

-- 17. Completed manager notes cannot be deleted.
select throws_ok(
  $$
    delete from public.performance_review_manager_notes
    where review_id = '88888888-8888-4888-8888-888888888888'
  $$,
  '42501',
  null,
  'completed manager notes cannot be deleted'
);

reset role;

-- 18. Meeting organizer can add a participant.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select lives_ok(
  $$
    insert into public.meeting_participants (
      meeting_id,
      profile_id
    )
    values (
      '99999999-9999-4999-8999-999999999999',
      '33333333-3333-4333-8333-333333333333'
    )
  $$,
  'meeting organizer can add a participant'
);

reset role;

-- 19. Participant can view the meeting.
select public.set_test_profile('33333333-3333-4333-8333-333333333333');
set local role authenticated;

select is(
  (
    select count(*)
    from public.meetings
    where id = '99999999-9999-4999-8999-999999999999'
  ),
  1::bigint,
  'participant can view the meeting'
);

reset role;

-- 20. Unrelated employee cannot view the meeting.
select public.set_test_profile('44444444-4444-4444-8444-444444444444');
set local role authenticated;

select is(
  (
    select count(*)
    from public.meetings
    where id = '99999999-9999-4999-8999-999999999999'
  ),
  0::bigint,
  'unrelated employee cannot view the meeting'
);

reset role;

-- 21. Business role alone grants no department data access.
select public.set_test_profile('77777777-7777-4777-8777-777777777777');
set local role authenticated;

select is(
  (
    select count(*)
    from public.performance_measurables
    where department_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  0::bigint,
  'business role alone grants no department data access'
);

reset role;

-- Explicit department leadership is granted only by an administrator-managed row.
insert into public.department_leaders (
  department_id,
  profile_id,
  created_by
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111'
);

-- 22. Explicit department leader can read department data.
select public.set_test_profile('77777777-7777-4777-8777-777777777777');
set local role authenticated;

select is(
  (
    select count(*)
    from public.performance_measurables
    where department_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  1::bigint,
  'explicit department leader can read department data'
);

reset role;

-- 23. Inactive user is denied active-only access.
select public.set_test_profile('66666666-6666-4666-8666-666666666666');
set local role authenticated;

select is(
  (
    select count(*)
    from public.audit_events
  ),
  0::bigint,
  'inactive user is denied'
);

reset role;

-- 24. Anonymous access is denied.
set local role anon;

select throws_ok(
  $$
    select count(*)
    from public.performance_reviews
    where id = '88888888-8888-4888-8888-888888888888'
  $$,
  '42501',
  null,
  'anonymous access is denied'
);

reset role;

-- 25. Organizer can remove a meeting participant.
select public.set_test_profile('22222222-2222-4222-8222-222222222222');
set local role authenticated;

select lives_ok(
  $$
    delete from public.meeting_participants
    where meeting_id = '99999999-9999-4999-8999-999999999999'
      and profile_id = '33333333-3333-4333-8333-333333333333'
  $$,
  'organizer can remove a meeting participant'
);

reset role;

-- 26. Removed participant loses meeting access.
select public.set_test_profile('33333333-3333-4333-8333-333333333333');
set local role authenticated;

select is(
  (
    select count(*)
    from public.meetings
    where id = '99999999-9999-4999-8999-999999999999'
  ),
  0::bigint,
  'removed participant loses meeting access'
);

reset role;

select * from finish();

rollback;
