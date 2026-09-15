-- Cabinet Genies Portal — Phase 3
-- Production commission plan defaults.
--
-- This seeds the Cabinet Genies standard production schedule as *configuration*.
-- The engine never hardcodes these numbers: it resolves the tier from
-- compensation_plan_tiers at calculation time and snapshots the result onto the
-- commission event. Editing these rows (through Admin → Commission settings)
-- changes future calculations only.
--
--   GP >= 50%            -> 30% of commissionable gross profit
--   GP >= 45% and < 50%  -> 20%
--   GP >= 35% and < 45%  -> 10%
--   GP < 35%             -> 0%
--
-- Band convention: the lower bound is inclusive and the upper bound is exclusive.
-- Idempotent: skips the seed when a plan with this name already exists.

do $$
declare
  existing_plan_id uuid;
  plan_id uuid;
  version_id uuid;
begin
  select id into existing_plan_id
  from public.compensation_plans
  where lower(name) = lower('Cabinet Genies Standard GP Commission');

  if existing_plan_id is not null then
    raise notice 'Cabinet Genies Standard GP Commission already exists (%). Skipping seed.', existing_plan_id;
    return;
  end if;

  insert into public.compensation_plans (name, description, participant_kind, plan_type, active)
  values (
    'Cabinet Genies Standard GP Commission',
    'Production commission schedule based on commissionable gross profit, measured after burden. Rates are configuration: edit the tiers here rather than in code.',
    'sales_designer',
    'straight_gp',
    true
  )
  returning id into plan_id;

  insert into public.compensation_plan_versions (
    compensation_plan_id,
    version_name,
    effective_from,
    effective_to,
    active,
    notes
  )
  values (
    plan_id,
    'v1',
    date '2026-01-01',
    null,
    true,
    'Initial production schedule: 30% at or above 50% GP, 20% from 45%, 10% from 35%, 0% below 35%. Effective-dated so historical commission events keep the version they were calculated under.'
  )
  returning id into version_id;

  insert into public.compensation_plan_tiers (
    compensation_plan_version_id,
    sort_order,
    lower_gp_percent,
    lower_threshold_type,
    upper_gp_percent,
    upper_threshold_type,
    rate,
    label
  )
  values
    (version_id, 1, 0.500000, 'fixed', null, 'fixed', 0.300000, '50% GP and above'),
    (version_id, 2, 0.450000, 'fixed', 0.500000, 'fixed', 0.200000, '45% to under 50% GP'),
    (version_id, 3, 0.350000, 'fixed', 0.450000, 'fixed', 0.100000, '35% to under 45% GP'),
    (version_id, 4, null, 'fixed', 0.350000, 'fixed', 0.000000, 'Under 35% GP');

  raise notice 'Seeded Cabinet Genies Standard GP Commission (%) with version %.', plan_id, version_id;
end;
$$;
