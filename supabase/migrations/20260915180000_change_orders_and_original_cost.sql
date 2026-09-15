-- Cabinet Genies Portal — Phase 3.8
-- Simplify job financials: one original cost, and change orders as child records.
--
-- What changes, and what deliberately does not:
--
--   * `jobs.contract_revenue` is the **Original Contract Price**.
--   * `jobs.original_cost` (new) is the **Original Costs** input. It replaces the
--     four visible cost buckets (material, labour, subcontractor, other direct).
--     Those columns are NOT dropped — historical rows keep their values, and the
--     backfill below folds them into `original_cost` exactly once. From this phase
--     on they are superseded storage: nothing reads or writes them, so there is
--     one source of truth for original cost.
--   * `job_change_orders` (new) stores each change order as a real child record —
--     number/name, revenue and cost — instead of collapsing everything into one
--     aggregate number. Removing a change order sets `active = false` rather than
--     deleting the row, so the history survives once commission has been paid on it.
--   * `jobs.change_order_revenue` (existing) and `jobs.change_order_cost` (new) are
--     the **derived roll-ups** of the active change orders. They are written by the
--     canonical calculation, never typed in, so there is no second source of truth.
--
-- Change order cost is a direct job cost: it sits inside direct job cost, which is
-- the base the burden and warranty contingency percentages apply to. Commissionable
-- GP and the tier continue to come from the canonical engine, unchanged.
--
-- Idempotent and safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Original cost, and the change order cost roll-up
-- ---------------------------------------------------------------------------

alter table public.jobs
  add column if not exists original_cost numeric(14,2) not null default 0;

alter table public.jobs
  add column if not exists change_order_cost numeric(14,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_original_cost_non_negative'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_original_cost_non_negative check (original_cost >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_change_order_cost_non_negative'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_change_order_cost_non_negative check (change_order_cost >= 0);
  end if;
end;
$$;

-- Carry the old cost buckets across exactly once. Only rows that still hold their
-- detail in the legacy columns are touched, so re-running changes nothing.
update public.jobs
   set original_cost = material_cost + labor_cost + subcontractor_cost + other_direct_cost
 where original_cost = 0
   and (material_cost + labor_cost + subcontractor_cost + other_direct_cost) > 0;

comment on column public.jobs.original_cost is
  'Original Costs: the single original job cost input, before change orders, burden and warranty contingency. Supersedes the material/labor/subcontractor/other-direct columns, which are retained for historical rows only.';

comment on column public.jobs.contract_revenue is
  'Original Contract Price. Change order revenue is rolled up separately in change_order_revenue.';

comment on column public.jobs.change_order_revenue is
  'Derived roll-up of the active job_change_orders.revenue rows. Never typed in directly.';

comment on column public.jobs.change_order_cost is
  'Derived roll-up of the active job_change_orders.cost rows. A direct job cost, so it is inside the burden and warranty contingency base.';

comment on column public.jobs.material_cost is
  'Superseded by jobs.original_cost in Phase 3.8. Kept for historical rows; not read or written by the application.';
comment on column public.jobs.labor_cost is
  'Superseded by jobs.original_cost in Phase 3.8. Kept for historical rows; not read or written by the application.';
comment on column public.jobs.subcontractor_cost is
  'Superseded by jobs.original_cost in Phase 3.8. Kept for historical rows; not read or written by the application.';
comment on column public.jobs.other_direct_cost is
  'Superseded by jobs.original_cost in Phase 3.8. Kept for historical rows; not read or written by the application.';

-- ---------------------------------------------------------------------------
-- 2. Change orders
-- ---------------------------------------------------------------------------

create table if not exists public.job_change_orders (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  change_order_number text,
  name text not null,
  revenue numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_change_orders_name_not_blank check (btrim(name) <> ''),
  constraint job_change_orders_number_not_blank
    check (change_order_number is null or btrim(change_order_number) <> ''),
  constraint job_change_orders_revenue_non_negative check (revenue >= 0),
  constraint job_change_orders_cost_non_negative check (cost >= 0)
);

comment on table public.job_change_orders is
  'Change orders for a job: number/name, revenue and cost. Removed change orders are deactivated, never deleted, so history survives after commission has been paid. The job row carries the derived roll-ups.';

create index if not exists job_change_orders_job_idx
  on public.job_change_orders (job_id, created_at);

drop trigger if exists job_change_orders_set_updated_at on public.job_change_orders;
create trigger job_change_orders_set_updated_at
  before update on public.job_change_orders
  for each row
  execute function public.set_updated_at();

drop trigger if exists job_change_orders_audit on public.job_change_orders;
create trigger job_change_orders_audit
  after insert or update on public.job_change_orders
  for each row
  execute function public.log_config_audit_event('job_change_order');

alter table public.job_change_orders enable row level security;

revoke all on table public.job_change_orders from anon;
grant select, insert, update on table public.job_change_orders to authenticated;

drop policy if exists "Change orders are readable with their job" on public.job_change_orders;
create policy "Change orders are readable with their job"
  on public.job_change_orders
  for select
  to authenticated
  using (
    public.current_profile_role_is('accounting', 'admin', 'ceo')
    or exists (
      select 1
      from public.jobs j
      where j.id = job_id
        and (
          j.sales_designer_id = auth.uid()
          or public.manages_profile(j.sales_designer_id)
        )
    )
  );

drop policy if exists "Change orders are created by finance and administrators" on public.job_change_orders;
create policy "Change orders are created by finance and administrators"
  on public.job_change_orders
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('accounting', 'admin', 'ceo')
    and created_by = auth.uid()
  );

drop policy if exists "Change orders are edited by finance and administrators" on public.job_change_orders;
create policy "Change orders are edited by finance and administrators"
  on public.job_change_orders
  for update
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'))
  with check (public.current_profile_role_is('accounting', 'admin', 'ceo'));

-- ---------------------------------------------------------------------------
-- 3. Audit the financial inputs the new model turns on
--
-- The Phase 2 job audit trigger lists the columns it watches and does not know
-- about original_cost or the change order roll-ups, so this adds a small, explicit
-- trigger for exactly those four inputs rather than rewriting that function.
-- ---------------------------------------------------------------------------

create or replace function public.log_job_financial_inputs_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  changed jsonb := '{}'::jsonb;
begin
  if new.contract_revenue is distinct from old.contract_revenue then
    changed := changed || jsonb_build_object(
      'original_contract_price',
      jsonb_build_object('from', old.contract_revenue, 'to', new.contract_revenue)
    );
  end if;

  if new.original_cost is distinct from old.original_cost then
    changed := changed || jsonb_build_object(
      'original_cost',
      jsonb_build_object('from', old.original_cost, 'to', new.original_cost)
    );
  end if;

  if new.change_order_revenue is distinct from old.change_order_revenue then
    changed := changed || jsonb_build_object(
      'change_order_revenue',
      jsonb_build_object('from', old.change_order_revenue, 'to', new.change_order_revenue)
    );
  end if;

  if new.change_order_cost is distinct from old.change_order_cost then
    changed := changed || jsonb_build_object(
      'change_order_cost',
      jsonb_build_object('from', old.change_order_cost, 'to', new.change_order_cost)
    );
  end if;

  if changed <> '{}'::jsonb then
    insert into public.audit_events (entity_type, entity_id, action, changed_by, metadata)
    values ('job', new.id, 'job_financial_inputs_changed', actor, changed);
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_financial_inputs_audit on public.jobs;
create trigger jobs_financial_inputs_audit
  after update on public.jobs
  for each row
  execute function public.log_job_financial_inputs_audit();

revoke all on function public.log_job_financial_inputs_audit() from public;
