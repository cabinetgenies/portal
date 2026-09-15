-- Cabinet Genies Portal — Phase 4
-- New Sales Designer commission bands, as a NEW version of the production plan.
--
-- The band schedule becomes seven fixed gross-profit bands:
--
--   below 30.00% GP          0%
--   30.00% – 34.99%          5%
--   35.00% – 39.99%         10%
--   40.00% – 44.99%         15%
--   45.00% – 46.99%         20%
--   47.00% – 48.99%         25%
--   49.00% and above        30%
--
-- Lower bounds are inclusive and upper bounds exclusive, which is how
-- `resolveTierForGpPercent` reads them, so 34.99% earns 5% and 35.00% earns 10%.
-- There is no interpolation and no curve: below 30% GP the rate is exactly zero.
--
-- Historical safety: this adds a new version and never touches the previous
-- version's rates or tiers. Closing the old version's effective window the day
-- before the new one starts is what the effective-dating model requires — two open
-- versions of one plan would overlap, which the database refuses — and it changes
-- nothing about history: jobs, audits and commission events reference the version
-- they were calculated under by id, and that version and its tiers still exist.
--
-- The bands live here as data. Nothing in the calculation code knows these numbers.
--
-- Idempotent and safe to re-run.

do $$
declare
  v_plan_id uuid;
  v_existing_version uuid;
  v_version_id uuid;
begin
  select id into v_plan_id
  from public.compensation_plans
  where name = 'Cabinet Genies Standard GP Commission'
    and participant_kind = 'sales_designer'
  order by created_at
  limit 1;

  if v_plan_id is null then
    raise exception
      'The production sales designer plan (Cabinet Genies Standard GP Commission) was not found.';
  end if;

  select id into v_existing_version
  from public.compensation_plan_versions
  where compensation_plan_id = v_plan_id
    and version_name = 'v2';

  if v_existing_version is not null then
    raise notice 'Version v2 already exists (%). Skipping.', v_existing_version;
    return;
  end if;

  -- Close the outgoing version the day before the new schedule takes effect, so the
  -- plan's effective windows stay contiguous and non-overlapping.
  update public.compensation_plan_versions
     set effective_to = date '2026-09-14'
   where compensation_plan_id = v_plan_id
     and effective_to is null
     and effective_from <= date '2026-09-14';

  insert into public.compensation_plan_versions (
    compensation_plan_id,
    version_name,
    effective_from,
    effective_to,
    active,
    notes
  )
  values (
    v_plan_id,
    'v2',
    date '2026-09-15',
    null,
    true,
    'Sales designer commission bands effective 2026-09-15: 0% below 30% GP, then 5/10/15/20/25/30% at 30/35/40/45/47/49% GP. Fixed bands with inclusive lower and exclusive upper bounds; no interpolation. Supersedes v1, which remains the version historical jobs, audits and events were calculated under.'
  )
  returning id into v_version_id;

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
    (v_version_id, 1, 0.490000, 'fixed', null,     'fixed', 0.300000, '49% GP and above'),
    (v_version_id, 2, 0.470000, 'fixed', 0.490000, 'fixed', 0.250000, '47% to under 49% GP'),
    (v_version_id, 3, 0.450000, 'fixed', 0.470000, 'fixed', 0.200000, '45% to under 47% GP'),
    (v_version_id, 4, 0.400000, 'fixed', 0.450000, 'fixed', 0.150000, '40% to under 45% GP'),
    (v_version_id, 5, 0.350000, 'fixed', 0.400000, 'fixed', 0.100000, '35% to under 40% GP'),
    (v_version_id, 6, 0.300000, 'fixed', 0.350000, 'fixed', 0.050000, '30% to under 35% GP'),
    (v_version_id, 7, 0.000000, 'fixed', 0.300000, 'fixed', 0.000000, 'Below 30% GP (no commission)');

  raise notice 'Seeded version v2 (%) with 7 commission bands.', v_version_id;
end;
$$;
