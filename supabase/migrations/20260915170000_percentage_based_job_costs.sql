-- Cabinet Genies Portal — Phase 3.7
-- Percentage-based burden and warranty / service contingency.
--
-- The rule, implemented once in lib/commission/financials.ts and documented in
-- docs/commission-engine.md:
--
--   direct_job_cost              = material + labor + subcontractor + other direct
--   burden_cost                  = round(direct_job_cost * burden_percent)
--   warranty_service_contingency = round(direct_job_cost * warranty_contingency_percent)
--   total_job_cost               = direct_job_cost + burden_cost + warranty_service_contingency
--
-- The base for BOTH percentages is direct job cost, before burden and warranty are
-- added. Neither is applied to revenue: both are cost-side reserves, and a share of
-- revenue would inflate cost on high-revenue jobs — a different financial rule that
-- nothing in this schema, these migrations or docs/ ever defined. Until this phase
-- the two amounts were raw dollar inputs with no stated basis, so the base is set
-- here explicitly rather than inferred.
--
-- Where the numbers live
--   * commission_settings.burden_percent / warranty_contingency_percent are the
--     company defaults: effective-dated, admin/CEO-maintained, viewable by
--     accounting. They are rule inputs, never constants in code.
--   * jobs.burden_percent / jobs.warranty_contingency_percent are the per-job
--     snapshot. NULL means "the company default applies"; the server writes the
--     resolved value on every save, so a later change to the company default can
--     never rewrite an existing job's cost structure.
--   * jobs.burden_cost / jobs.warranty_service_contingency remain the derived,
--     stored dollar amounts — the snapshot the GP figures and commission events
--     were calculated from.
--
-- Defaults are 0.00%: Cabinet Genies' real percentages are business data, and this
-- migration will not invent a production number. Set them under
-- Admin → Commission settings before entering new jobs.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.commission_settings
  add column if not exists burden_percent numeric(9,6) not null default 0;

alter table public.commission_settings
  add column if not exists warranty_contingency_percent numeric(9,6) not null default 0;

alter table public.jobs
  add column if not exists burden_percent numeric(9,6);

alter table public.jobs
  add column if not exists warranty_contingency_percent numeric(9,6);

-- ---------------------------------------------------------------------------
-- 2. Carry any existing dollar amounts across as the equivalent percentage
--
-- Jobs created before this phase stored dollars with no percentage. Deriving the
-- rate keeps the same total cost under the new rule instead of silently zeroing a
-- cost the job was already sized with. Clamped to the allowed range: a job whose
-- burden exceeded its direct cost cannot be represented as a percentage, and the
-- check constraints below are the authority on what is valid.
-- ---------------------------------------------------------------------------

update public.jobs
   set burden_percent = least(
         1,
         greatest(
           0,
           round(
             burden_cost
               / (material_cost + labor_cost + subcontractor_cost + other_direct_cost),
             6
           )
         )
       )
 where burden_percent is null
   and burden_cost > 0
   and (material_cost + labor_cost + subcontractor_cost + other_direct_cost) > 0;

update public.jobs
   set warranty_contingency_percent = least(
         1,
         greatest(
           0,
           round(
             warranty_service_contingency
               / (material_cost + labor_cost + subcontractor_cost + other_direct_cost),
             6
           )
         )
       )
 where warranty_contingency_percent is null
   and warranty_service_contingency > 0
   and (material_cost + labor_cost + subcontractor_cost + other_direct_cost) > 0;

-- ---------------------------------------------------------------------------
-- 3. Range constraints
--
-- A percentage is a decimal share: 0.10 is ten percent. Negative or greater than
-- 100% burden is a data-entry error, not a business rule.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_settings_burden_percent_range'
      and conrelid = 'public.commission_settings'::regclass
  ) then
    alter table public.commission_settings
      add constraint commission_settings_burden_percent_range
      check (burden_percent >= 0 and burden_percent <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_settings_warranty_percent_range'
      and conrelid = 'public.commission_settings'::regclass
  ) then
    alter table public.commission_settings
      add constraint commission_settings_warranty_percent_range
      check (warranty_contingency_percent >= 0 and warranty_contingency_percent <= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_burden_percent_range'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_burden_percent_range
      check (burden_percent is null or (burden_percent >= 0 and burden_percent <= 1));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_warranty_percent_range'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_warranty_percent_range
      check (
        warranty_contingency_percent is null
        or (warranty_contingency_percent >= 0 and warranty_contingency_percent <= 1)
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Documentation
-- ---------------------------------------------------------------------------

comment on column public.commission_settings.burden_percent is
  'Company default burden rate as a decimal share (0.1 = 10%). Applied to direct job cost (material + labor + subcontractor + other direct), before burden and warranty contingency are added. Admin/CEO only; every job snapshots the rate it used.';

comment on column public.commission_settings.warranty_contingency_percent is
  'Company default warranty / service contingency rate as a decimal share (0.05 = 5%). Applied to the same direct job cost base as burden. Admin/CEO only; every job snapshots the rate it used.';

comment on column public.jobs.burden_percent is
  'Burden rate snapshotted for this job. NULL means the company default applied; the server writes the resolved rate on every save. Changing the company default later does not rewrite this job or any commission event calculated from it.';

comment on column public.jobs.warranty_contingency_percent is
  'Warranty / service contingency rate snapshotted for this job. NULL means the company default applied. See jobs.burden_percent for the historical-protection rule.';

comment on column public.jobs.burden_cost is
  'Derived burden cost: direct job cost x burden_percent, rounded to cents. Stored so the GP figures and commission events keep the number they were calculated with.';

comment on column public.jobs.warranty_service_contingency is
  'Derived warranty / service contingency: direct job cost x warranty_contingency_percent, rounded to cents. Stored for historical accuracy.';
