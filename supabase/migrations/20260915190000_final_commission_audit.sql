-- Cabinet Genies Portal — Phase 3.9
-- The final commission audit: a deliberate, snapshotted workflow.
--
-- Live financials (Phase 3.8) are an estimate that changes while a job is open.
-- The final audit is the authoritative record: it is opened explicitly, reviewed
-- against the live picture, then finalized — which snapshots every input, the plan
-- version, the tier and rates, and the resulting true-up.
--
-- Revisions are append-only. There is no DELETE policy or grant on this table:
-- correcting an audit supersedes the old revision and opens a new one, so a payout
-- calculation that has already been recognized is never silently overwritten.
--
-- `jobs.gp_audit_completed_date` is now written *by* the finalization, not typed in
-- beside normal job entry, and the final true-up action refuses to run without a
-- finalized audit.
--
-- Idempotent and safe to re-run.

create table if not exists public.commission_audits (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  revision integer not null default 1,
  status text not null default 'in_review',

  -- Revenue as audited.
  original_contract_price numeric(14,2) not null default 0,
  change_order_revenue numeric(14,2) not null default 0,
  other_revenue numeric(14,2) not null default 0,
  credit_amount numeric(14,2) not null default 0,

  -- Cost as audited, including the rate snapshots.
  original_cost numeric(14,2) not null default 0,
  change_order_cost numeric(14,2) not null default 0,
  direct_job_cost numeric(14,2) not null default 0,
  burden_percent numeric(9,6) not null default 0,
  burden_cost numeric(14,2) not null default 0,
  warranty_contingency_percent numeric(9,6) not null default 0,
  warranty_service_contingency numeric(14,2) not null default 0,

  -- Audited results.
  final_total_revenue numeric(14,2) not null default 0,
  final_total_cost numeric(14,2) not null default 0,
  final_gross_profit numeric(14,2) not null default 0,
  final_gp_percent numeric(9,6) not null default 0,
  commissionable_revenue numeric(14,2) not null default 0,
  commissionable_cost numeric(14,2) not null default 0,
  commissionable_gross_profit numeric(14,2) not null default 0,
  commissionable_gp_percent numeric(9,6) not null default 0,

  -- Rule snapshot: the plan version and the rates the audit was measured against.
  compensation_plan_id uuid references public.compensation_plans (id) on delete restrict,
  compensation_plan_version_id uuid references public.compensation_plan_versions (id) on delete restrict,
  tier_label text,
  standard_commission_rate numeric(9,6) not null default 0,
  draw_rate_reduction numeric(9,6) not null default 0,
  effective_commission_rate numeric(9,6) not null default 0,
  final_gross_commission numeric(14,2) not null default 0,
  previously_recognized numeric(14,2) not null default 0,
  final_true_up numeric(14,2) not null default 0,

  notes text,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  finalized_by uuid references public.profiles (id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commission_audits_status_supported
    check (status in ('in_review', 'finalized', 'superseded')),
  constraint commission_audits_revision_positive check (revision >= 1),
  constraint commission_audits_finalized_requires_actor
    check (status <> 'finalized' or (finalized_at is not null and finalized_by is not null)),
  constraint commission_audits_rates_range
    check (
      standard_commission_rate >= 0 and standard_commission_rate <= 1
      and effective_commission_rate >= 0 and effective_commission_rate <= 1
      and draw_rate_reduction >= 0 and draw_rate_reduction <= 1
      and burden_percent >= 0 and burden_percent <= 1
      and warranty_contingency_percent >= 0 and warranty_contingency_percent <= 1
    ),
  constraint commission_audits_revision_unique unique (job_id, revision)
);

comment on table public.commission_audits is
  'Final commission audit for a job: an explicit workflow that snapshots the audited financials, the plan version, the tier and rates, the burden and warranty percentages and dollars, and the resulting final true-up. Revisions are append-only — superseding an audit opens a new revision instead of overwriting the old one.';

comment on column public.commission_audits.final_true_up is
  'Final gross commission minus the commission already recognized. Positive means still payable, zero means settled, negative creates a rollover obligation rather than a negative payment.';

create index if not exists commission_audits_job_idx
  on public.commission_audits (job_id, revision desc);

-- One open (in-review) audit per job at a time.
create unique index if not exists commission_audits_open_key
  on public.commission_audits (job_id)
  where status = 'in_review';

create index if not exists commission_audits_status_idx
  on public.commission_audits (status, created_at desc);

drop trigger if exists commission_audits_set_updated_at on public.commission_audits;
create trigger commission_audits_set_updated_at
  before update on public.commission_audits
  for each row
  execute function public.set_updated_at();

drop trigger if exists commission_audits_audit on public.commission_audits;
create trigger commission_audits_audit
  after insert or update on public.commission_audits
  for each row
  execute function public.log_config_audit_event('commission_audit');

alter table public.commission_audits enable row level security;

revoke all on table public.commission_audits from anon;
grant select, insert, update on table public.commission_audits to authenticated;

drop policy if exists "Commission audits are readable with their job" on public.commission_audits;
create policy "Commission audits are readable with their job"
  on public.commission_audits
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

drop policy if exists "Commission audits are opened by finance and administrators" on public.commission_audits;
create policy "Commission audits are opened by finance and administrators"
  on public.commission_audits
  for insert
  to authenticated
  with check (
    public.current_profile_role_is('accounting', 'admin', 'ceo')
    and status = 'in_review'
    and started_by = auth.uid()
  );

drop policy if exists "Commission audits are progressed by finance and administrators" on public.commission_audits;
create policy "Commission audits are progressed by finance and administrators"
  on public.commission_audits
  for update
  to authenticated
  using (public.current_profile_role_is('accounting', 'admin', 'ceo'))
  with check (public.current_profile_role_is('accounting', 'admin', 'ceo'));

-- Audits are read row-by-row in the job's history; full replica identity keeps the
-- audit trail readable if realtime is ever switched on for them.
alter table public.commission_audits replica identity full;
