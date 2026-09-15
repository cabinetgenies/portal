-- Cabinet Genies Portal — Phase 2
-- Optional sample configuration.
--
-- This is NOT the confirmed Cabinet Genies production commission plan. It exists
-- so the plan/version/tier architecture can be exercised end to end (and so the
-- straight-GP tier shape can be reviewed) before the real policy is agreed.
-- Every row below is ordinary, editable configuration: change it, deactivate it
-- or delete it once the confirmed plan is defined.
--
-- Tier shape (as provided for the sample):
--   at or above the project minimum GP standard -> 33%
--   25% up to the project minimum GP standard   -> 28%
--   15% to under 25%                            -> 10%
--   under 15%                                   -> 0%
--
-- Note that the top band references the *project category's* minimum GP standard
-- rather than a fixed number, which is expressed with threshold_type =
-- 'project_minimum'. The sample assumes category minimums at or above 25%.

do $$
declare
  existing_plan_id uuid;
  plan_id uuid;
  version_id uuid;
begin
  select id into existing_plan_id
  from public.commission_plans
  where lower(name) = lower('SEN Straight GP Example');

  if existing_plan_id is not null then
    raise notice 'SEN Straight GP Example already exists (%). Skipping seed.', existing_plan_id;
    return;
  end if;

  insert into public.commission_plans (name, description, plan_type, active)
  values (
    'SEN Straight GP Example',
    'SAMPLE ONLY — not the confirmed Cabinet Genies production plan. Straight gross-profit commission with tiers expressed against each project category''s minimum GP standard. Edit or replace this configuration once the commission policy is confirmed.',
    'straight_gp',
    true
  )
  returning id into plan_id;

  insert into public.commission_plan_versions (
    commission_plan_id,
    version_name,
    effective_from,
    effective_to,
    active,
    notes
  )
  values (
    plan_id,
    'v1 (sample)',
    date '2026-01-01',
    null,
    true,
    'Sample version used to validate the effective-dated plan model. Not a confirmed Cabinet Genies commission policy.'
  )
  returning id into version_id;

  insert into public.commission_tiers (
    commission_plan_version_id,
    sort_order,
    lower_gp_percent,
    lower_threshold_type,
    upper_gp_percent,
    upper_threshold_type,
    rate,
    label
  )
  values
    (version_id, 1, 0.000000, 'project_minimum', null, 'fixed', 0.330000,
     'At or above the project minimum GP standard'),
    (version_id, 2, 0.250000, 'fixed', 0.000000, 'project_minimum', 0.280000,
     '25% up to the project minimum GP standard'),
    (version_id, 3, 0.150000, 'fixed', 0.250000, 'fixed', 0.100000,
     '15% to under 25%'),
    (version_id, 4, null, 'fixed', 0.150000, 'fixed', 0.000000,
     'Under 15%');

  raise notice 'Seeded sample commission plan % (version %).', plan_id, version_id;
end;
$$;
