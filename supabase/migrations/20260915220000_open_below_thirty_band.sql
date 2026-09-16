-- Cabinet Genies Portal — Phase 4 correction
-- Make the v2 "Below 30%" band open-ended on the lower side.
--
-- Why: with a lower bound of 0.00, a loss-making job (negative GP) matched no band at
-- all. The engine still paid 0%, but the Final Commission Audit's readiness check
-- reported "no commission tier matches", which is not how the business rule reads:
-- every GP below 30% — negative, zero or positive — belongs to the Below 30% band and
-- earns nothing. A negative-GP job is a normal audit, not a configuration error.
--
-- The null lower bound is the schema's existing representation of an unbounded lower
-- range (v1's bottom band has always used it), so no schema change is needed: only the
-- one configuration row changes.
--
-- Nothing else is touched: the other six v2 bands, v1, historical commission events,
-- finalized audits and paid commissions are all left exactly as they are.
--
-- Idempotent and safe to re-run.

do $$
declare
  v_version_id uuid;
  v_tier_id uuid;
begin
  select v.id into v_version_id
  from public.compensation_plan_versions v
  join public.compensation_plans p on p.id = v.compensation_plan_id
  where p.name = 'Cabinet Genies Standard GP Commission'
    and p.participant_kind = 'sales_designer'
    and v.version_name = 'v2';

  if v_version_id is null then
    raise exception 'The v2 Sales Designer commission plan version was not found.';
  end if;

  select id into v_tier_id
  from public.compensation_plan_tiers
  where compensation_plan_version_id = v_version_id
    and lower_gp_percent = 0
    and upper_gp_percent = 0.3
    and rate = 0;

  if v_tier_id is null then
    raise notice 'The Below 30 percent band is already open-ended (or missing). Nothing to change.';
    return;
  end if;

  update public.compensation_plan_tiers
     set lower_gp_percent = null,
         lower_threshold_type = 'fixed',
         upper_gp_percent = 0.300000,
         upper_threshold_type = 'fixed',
         rate = 0.000000,
         label = 'Below 30% GP (no commission)'
   where id = v_tier_id;

  raise notice 'Opened the Below 30 percent band. Tier id: %', v_tier_id;
end;
$$;