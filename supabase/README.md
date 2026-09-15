# Supabase setup

Apply the migrations in order. Phase 1 created `public.profiles` and its security
model; Phase 2 added the commission domain; the Phase 3 preparation migrations
generalise the shared structures for future Sales Manager compensation (see
[docs/compensation-architecture.md](../docs/compensation-architecture.md)).

| Order | Migration | What it creates |
| --- | --- | --- |
| 1 | `migrations/20260915090000_create_profiles.sql` | `profiles`, the `auth.users` trigger, RLS, role helpers |
| 2 | `migrations/20260915120000_create_commission_domain.sql` | project categories, compensation plans, effective-dated versions, tiers, employee settings/assignments, jobs, financial adjustments, audit log, guard-rail triggers |
| 3 | `migrations/20260915120100_commission_domain_rls.sql` | Row Level Security policies and grants for the commission domain |
| 4 | `migrations/20260915120200_seed_sen_straight_gp_example.sql` | optional, editable sample plan (`SEN Straight GP Example`) |
| 5 | `migrations/20260915130000_generalize_compensation_domain.sql` | renames the shared tables and columns to compensation terminology, adds `participant_kind`, guards jobs against manager plans, neutralises policy and audit names |
| 6 | `migrations/20260915140000_employee_reporting_periods.sql` | effective-dated manager relationships, `manager_of_profile_at`, `direct_report_ids_at` |
| 7 | `migrations/20260915150000_commission_engine.sql` | commission settings, commission events, draw periods, draw ledger, rollover ledger, balance guards, workflow triggers, audit triggers |
| 8 | `migrations/20260915150100_commission_engine_rls.sql` | Row Level Security for settings, events and both ledgers |
| 9 | `migrations/20260915150200_seed_cabinet_genies_standard_plan.sql` | production plan `Cabinet Genies Standard GP Commission` (50% → 30%, 45% → 20%, 35% → 10%, below → 0%) |
| 10 | `migrations/20260915160000_user_directory_audit.sql` | profile audit trail (`user_created`, `role_changed`, `manager_changed`, `active_status_changed`, …) and the admin policy that links a profile to an existing auth user |
| 11 | `migrations/20260915170000_percentage_based_job_costs.sql` | percentage-based burden and warranty / service contingency: company defaults on `commission_settings`, per-job snapshots on `jobs`, derived dollars kept, and range constraints |
| 12 | `migrations/20260915180000_change_orders_and_original_cost.sql` | simplified job financials: `jobs.original_cost` and `jobs.change_order_cost`, the `job_change_orders` table with RLS and audit, and an audit trigger for the financial inputs |
| 13 | `migrations/20260915190000_final_commission_audit.sql` | the final commission audit: `commission_audits` snapshot table with revisions, RLS, audit trigger, one open audit per job, and finalized-requires-actor constraints |
| 14 | `migrations/20260915200000_sales_designer_commission_bands_v2.sql` | new Sales Designer band schedule as version `v2` of the production plan: seven fixed GP bands (0/5/10/15/20/25/30%) with inclusive lower and exclusive upper bounds, and the previous version closed the day before it starts |
| 15 | `migrations/20260915210000_remove_project_categories_from_commissions.sql` | project categories leave the commission system: every job is detached from its category and `jobs.project_category_id` becomes nullable; the column and table are marked dormant |
| 16 | `migrations/20260915220000_open_below_thirty_band.sql` | correction to v2: the "Below 30%" band becomes open-ended on the lower side (null lower bound), so negative and zero GP resolve to it explicitly at 0% |
| 17 | `migrations/20260915230000_business_architecture.sql` | departments, business roles, `profiles.department_id` / `profiles.business_role_id` with the department-name sync trigger and the extended profile audit, the module registry, role module experience, the dashboard widget and quick action registries, and the knowledge metadata foundation |
| 18 | `migrations/20260915230100_business_architecture_rls.sql` | Row Level Security for the business architecture: configuration is readable by signed-in users, writable by admin/CEO only, and published knowledge is readable by everyone |
| 19 | `migrations/20260915230200_seed_business_architecture.sql` | the ten official departments, the twelve business roles, the module registry, the widget and quick action catalogs, and one default experience per role |
| 20 | `migrations/20260915240000_google_sign_in.sql` | new auth users arrive without portal access: the sign-up trigger creates the profile with the provider's name but `active = false`, so Google sign-in (or any other way in) authenticates without authorizing |

Every script is idempotent, so re-running one is safe.

Migrations 17–19 are Phase 5 (role experience architecture). They are additive:
nothing is truncated, deleted or dropped, no commission table is touched, and the
existing security roles stay authoritative. Role configuration decides what is
*shown*; capabilities and RLS decide what is *allowed*. See
[docs/role-experience-architecture.md](../docs/role-experience-architecture.md).

The seed reconciles the catalog rows from the code registry on every run, but it
never overwrites an administrator's role experience: the `role_modules`,
`role_dashboard_widgets` and `role_quick_actions` inserts are
`on conflict do nothing`, so re-running the migration cannot undo configured work.

**Phase 5.1** (canonical projects) needed no schema change: the work was routing,
link targets and the seed's quick-action hrefs. Re-running
`20260915230200_seed_business_architecture.sql` is what reconciles an already
seeded deployment — it moves `new_project` to `/projects/new` and
`update_financials` to `/projects`. That idempotent re-run is safe: catalog rows
are updated, role experience rows are left alone, and every change lands in
`audit_events`. Phase 5.1 also assigned the CEO's business role explicitly, which
is profile data rather than schema.

The commission engine is documented in
[docs/commission-engine.md](../docs/commission-engine.md).

Migration 4 deliberately uses the Phase 2 table names: it runs *before* the
rename in migration 5, which carries its rows across unchanged. Some constraint
and trigger names keep the Phase 2 `commission_*` prefix after the rename; they
are cosmetic and cannot be referenced by application code.

## Apply the migration

The Supabase CLI is not linked in this repository yet, so pick one of these:

**Option A — Supabase dashboard (fastest)**

1. Open the project → **SQL Editor** → **New query**.
2. Paste and run each file in the table above, in order.

**Option B — Supabase CLI**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## Phase 2 checklist

After running the migrations:

1. **Commission bands**: review the production plan's GP bands under
   Admin → Compensation plans. (Project categories, once part of this checklist,
   were removed from the commission system in Phase 4.1 — see below.)
2. **Admin → Compensation plans**: if you ran the optional seed, review
   `SEN Straight GP Example`. It is a sample, not the confirmed policy — rename,
   edit or delete it once the real plan is agreed.
3. Give the real plan an effective-dated version, then add its GP tiers. Tiers
   can reference the project's minimum GP standard instead of a fixed number
   (`threshold_type = project_minimum`).
4. **Commissions → Employees**: mark who is compensation eligible and which plan
   applies to them, effective-dated.
5. **Commissions → Jobs**: create jobs, then let accounting enter the financial
   inputs on each job.

## Create the first portal users

1. Dashboard → **Authentication** → **Users** → **Add user**.
2. Set the email and a password. Supabase hashes and stores the password; the
   portal never handles password material itself.
3. The `on_auth_user_created` trigger inserts the matching `profiles` row with the
   default role `employee` and **no portal access** (`active = false`). Migration 20
   made approval explicit: an auth user existing is not the same as a person being
   allowed in, whether they arrive through a password, an invite or Google.
4. Approve them in **Admin → Users** — set the role, department and manager, then
   switch their status to Active. That is the normal path for every account,
   including colleagues who sign in with Google before being approved.
5. The very first administrator cannot use that screen (nobody is approved yet),
   so promote them from the SQL editor:

```sql
-- The auth trigger already created the profile with active = false. The
-- profiles_protect_privileged_columns trigger refuses privileged changes from a
-- session with no signed-in administrator, which is what a SQL editor session is
-- (auth.uid() is null there), so it is disabled for these two statements only.
alter table public.profiles disable trigger profiles_protect_privileged_columns;

update public.profiles
set role = 'admin', active = true
where email = 'admin@cabinetgenies.com';

alter table public.profiles enable trigger profiles_protect_privileged_columns;
```

The disable/enable pair is required precisely because that guard works: a
signed-in non-administrator can never promote themselves, and with no
administrator signed in there is no one for it to recognize. Afterwards every
approval happens through the directory, where the trigger can see who is acting.

Optional profile fields can also be supplied when creating a user, via user
metadata:

```json
{ "first_name": "Dana", "last_name": "Reed", "department": "Sales" }
```

Google sign-in supplies its own: `given_name`, `family_name` and `full_name` are
read by the trigger, so an unapproved Google account still appears in the
directory as a named person rather than an email address.

## Google sign-in (Phase 6)

Enable the Google provider in **Authentication → Providers → Google**, and add
the application callback (`https://<your-domain>/auth/callback`) to
**Authentication → URL Configuration → Redirect URLs**. The full checklist — the
Google Cloud client, the Supabase callback URL and the environment values — is in
[docs/google-sign-in.md](../docs/google-sign-in.md).

What the database side guarantees, and why the portal can rely on it:

| Guarantee | Where it lives |
| --- | --- |
| One person, one profile — a second Google identity cannot add a row | `profiles.id` is the primary key *and* the FK to `auth.users(id)`; `profiles_email_unique_idx` is unique on `lower(email)` |
| Signing in twice cannot duplicate anything | `handle_new_user` inserts `on conflict (id) do update` |
| New identities start without access | `handle_new_user` inserts `active = false`, role `employee` |
| A pending person cannot approve themselves | `profiles_protect_privileged_columns` rejects `active`/`role`/`department`/`manager_id`/`email` changes from anyone who is not an active administrator |
| An unapproved account resolves no role at all | `current_profile_role()` and `current_profile_is_admin()` both require `p.active` |
| Approval is attributable | the `profiles_audit` trigger records `active_status_changed` (and `role_changed`) with the acting administrator |

Existing profiles are untouched by migration 20: the trigger only fires when an
auth user is created, so every profile that already exists keeps its role and its
access. Re-running the migration cannot deactivate anybody.

## Verify

```sql
-- Every auth user should have exactly one profile row. A row with active = false
-- is somebody who has not been approved yet (Google sign-in included) or has been
-- deactivated; either way they can sign in but cannot open the portal.
select u.id, u.email, p.role
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- Which sign-in methods an account has. Google appears here after the first
-- Google sign-in, on the same auth user, without a second profile row.
select u.email, array_agg(i.provider order by i.provider) as providers
from auth.users u
join auth.identities i on i.user_id = u.id
group by u.email
order by u.email;
```

## What RLS allows

Profiles (Phase 1):

| Role | Can read | Can update |
| --- | --- | --- |
| employee | own profile | own profile (non-privileged columns) |
| supervisor | own profile + direct reports | own profile (non-privileged columns) |
| accounting | own profile + the user directory | own profile (non-privileged columns) |
| admin | all profiles | all profiles |
| ceo | all profiles | all profiles |

Compensation domain (Phase 2, renamed in the Phase 3 preparation migration):

| Table | Read | Write |
| --- | --- | --- |
| `compensation_plans`, `compensation_plan_versions`, `compensation_plan_tiers` | accounting, admin, ceo | admin, ceo |
| `employee_compensation_settings`, `employee_compensation_assignments` | accounting, admin, ceo | admin, ceo |
| `employee_reporting_periods` | the employee themselves, accounting, admin, ceo | admin, ceo (maintained automatically by the `profiles.manager_id` trigger) |
| `jobs` | own jobs (employee); own and direct reports' jobs (supervisor); all jobs (accounting, admin, ceo) | insert: admin, ceo. Update: accounting (financials, status and milestone dates only), admin, ceo. No delete for anyone — cancel instead |
| `job_financial_adjustments` | accounting, admin, ceo | insert only (append-only) |
| `audit_events` | accounting, admin, ceo | none — written only by SECURITY DEFINER triggers |

Anonymous (unauthenticated) requests can read nothing: table privileges for the
`anon` role are revoked and no policy grants it access.

Database guard rails on top of RLS:

* `jobs_validate_plan_reference` — a job may only reference a *sales designer*
  compensation plan; a manager plan can never be attached to a job.
* `jobs_protect_sold_plan` — a sold job's compensation plan or version can only be
  changed by an administrator.
* `jobs_enforce_update_permissions` — accounting cannot change job identity,
  sales designer or plan assignment.
* `compensation_plan_versions_prevent_overlap`,
  `employee_compensation_assignments_prevent_overlap` and
  `employee_reporting_periods_prevent_overlap` — two active versions of one plan,
  two assignments for one employee, or two managers for one employee cannot cover
  the same day.
* `job_financial_adjustments_no_update` plus the `audit_events` triggers — history
  rows are append-only.

## Manager relationships and attribution

`profiles.manager_id` stays the current reporting relationship (and the basis for
supervisor job visibility). `employee_reporting_periods` preserves who managed
whom over time; the `profiles_sync_reporting_period` trigger closes the open
period and opens a new one whenever `manager_id` changes.

Two functions are the documented access paths for future sales manager bonus
attribution:

* `manager_of_profile_at(profile_id, on_date)` — the manager in force on a date,
  falling back to the current pointer for dates before history began.
* `direct_report_ids_at(manager_id, on_date)` — the manager's active direct
  reports on a date.

`lib/compensation/attribution.ts` mirrors both in TypeScript and is unit tested.
Nothing calculates or pays a manager bonus yet.

## User directory (Phase 3.5)

`/admin/users` is a live table over `public.profiles` — there is no second user
store. It shows name, email, role, department, manager, status, compensation
eligibility, the compensation plan in force today and draw status, and it lets
admin/CEO edit those profile fields in place.

**Creating accounts.** Accounts are created through the Supabase Auth Admin API
from a `/admin/users` Server Action, which needs `SUPABASE_SERVICE_ROLE_KEY` on
the server. `auth.users` rows are never written with SQL, and no password material
is stored in the portal schema. When that key is not configured the page says so
and offers the two routes that do not need it: create the account in Supabase →
Authentication → Users (the `on_auth_user_created` trigger writes the profile row),
or link an existing auth user to a profile with the link form, which the
`Profiles can be linked by administrators` policy allows. Neither the browser nor
the anon key ever sees the service role key.

**Audit.** Every profile change writes an append-only row to `public.audit_events`
through the `profiles_audit` trigger: `user_created`, `user_name_changed`,
`role_changed`, `department_changed`, `manager_changed`, `active_status_changed`
and `user_email_changed`. Compensation eligibility, plan assignments and draw
periods already carry their own audit triggers, so the directory's recent activity
panel shows the whole setup history. Account creation through Supabase Auth is
attributed to Supabase Auth because no portal actor exists on that connection;
changes made through the portal are attributed to the signed-in administrator.

## Commission engine verification

After applying migrations 7–9, these read-only queries confirm the engine is in
place:

```sql
-- 1. Default rule inputs: 50% deposit payout, 5 point draw reduction, draw enabled.
select effective_from, deposit_payout_percent, draw_rate_reduction, draw_enabled
from public.commission_settings
order by effective_from;

-- 2. Production tiers: 30 / 20 / 10 / 0 with the expected GP bands.
select p.name, v.version_name, t.sort_order, t.lower_gp_percent, t.upper_gp_percent, t.rate, t.label
from public.compensation_plans p
join public.compensation_plan_versions v on v.compensation_plan_id = p.id
join public.compensation_plan_tiers t on t.compensation_plan_version_id = v.id
where p.name = 'Cabinet Genies Standard GP Commission'
order by v.effective_from desc, t.sort_order;

-- 3. Engine tables exist.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('commission_events', 'employee_draw_periods', 'employee_draw_ledger', 'commission_rollover_ledger', 'commission_settings')
order by table_name;

-- 4. Idempotency indexes exist: at most one deposit and one final true-up per job,
--    and at most one offset of each kind per event.
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('commission_events_job_stage_key', 'employee_draw_ledger_event_key', 'commission_rollover_ledger_event_key')
order by indexname;

-- 5. Ledger balances are derived, never stored.
select public.employee_draw_balance('<profile-uuid>') as outstanding_draw,
       public.employee_rollover_balance('<profile-uuid>') as outstanding_rollover,
       public.is_profile_on_draw_at('<profile-uuid>', current_date) as on_draw;

-- 6. Commission events for a job, with the snapshot each was calculated under.
select created_at, event_type, calculation_stage, status,
       commissionable_gp_percent, standard_commission_rate, draw_rate_reduction,
       effective_commission_rate, gross_commission, rollover_offset, draw_offset, net_payable
from public.commission_events
where job_id = '<job-uuid>'
order by created_at desc;
```

Applying the migrations does not create commission events. Events are created by
the application when a deposit is recorded (deposit event) and when a job is
GP-audited (final true-up); until then the dashboard shows empty queues.

## Derived job figures

`jobs.actual_total_*`, `jobs.job_gross_profit`, `jobs.job_gp_percent`,
`jobs.commissionable_*` and the commissionable percentages are **not** computed by
a database trigger. They are written by the application from the single shared
implementation in `lib/commission/financials.ts`, so exactly one calculation path
exists. Anything that changes a job's inputs or its adjustments recomputes them in
the same request.

## Commission job entry (Phase 3.6)

No migration was needed for this phase. `public.jobs` already carried every field
the workflow uses — four revenue columns, six cost columns including burden, the
milestone dates, and the compensation plan/version reference — and the Phase 2–3
guard-rail triggers already cover them.

`/sales/commissions/jobs/new` writes identity, the plan version, the revenue/cost
structure and the milestone dates in one submit, and recomputes the derived
columns through `lib/commission/financials.ts`. The form's live preview calls the
same functions, so the figures on screen are the figures that get stored.
`jobs_validate_plan_reference` still refuses a manager plan, and the `jobs` INSERT
policy still requires `created_by = auth.uid()`, so a job can only be created by
an administrator and is always attributed to them.

Recording `deposit_received_date` makes the **deposit** commission eligible and
recording `gp_audit_completed_date` makes the **final true-up** eligible. Neither
creates a commission event: events are still calculated deliberately from the
job's Commission section, so the workflow stays under human control.

## Percentage-based job costs (Phase 3.7)

Burden and warranty / service contingency are rates, not dollar inputs. The base
for both is **direct job cost** — material + labor + subcontractor + other direct —
before either is added. Neither is applied to revenue; both are cost-side reserves.
`computeJobFinancials` derives the dollars and `total_job_cost` includes them once,
so the stored `jobs.burden_cost` / `jobs.warranty_service_contingency` columns are
outputs that are kept for historical accuracy, never inputs.

| Layer | Columns | Who edits |
| --- | --- | --- |
| Company defaults (effective-dated) | `commission_settings.burden_percent`, `.warranty_contingency_percent` | admin/CEO; accounting can read |
| Per-job snapshot | `jobs.burden_percent`, `jobs.warranty_contingency_percent` | admin/CEO on the job form |
| Derived dollars | `jobs.burden_cost`, `jobs.warranty_service_contingency` | nobody — written by the server after each save |

Both columns default to `0.000000`, and every rate is constrained to 0–100%: the
company defaults stay at 0% until Cabinet Genies sets its real numbers under
Admin → Commission settings. A job that already had dollar amounts when this
migration ran had the equivalent rate derived from those dollars, so its total cost
did not change. A job saved under an older default keeps its own rate forever, which
is what protects approved and paid commission events from later rule changes.

## Simplified job financials and change orders (Phase 3.8)

The commission job financial model is now three inputs plus two rates:

| Input | Column |
| --- | --- |
| Original contract price | `jobs.contract_revenue` |
| Original costs | `jobs.original_cost` |
| Change orders | `job_change_orders` (one row per change order) |
| Burden % | `jobs.burden_percent`, defaulted from `commission_settings` |
| Warranty contingency % | `jobs.warranty_contingency_percent`, defaulted likewise |

`material_cost`, `labor_cost`, `subcontractor_cost` and `other_direct_cost` are
**superseded**: the migration folded them into `original_cost` once (only where
`original_cost` was still zero), and nothing reads or writes them afterwards, so
there is a single source of truth for original cost. They are kept because dropping
columns that historical rows were sized with is not a layout decision.

Change orders are child records with a number/name, revenue, cost and an `active`
flag. `jobs.change_order_revenue` and `jobs.change_order_cost` are derived roll-ups
of the active rows, written by the canonical calculation after every change, so the
aggregate can never disagree with the line items. Removing a change order sets
`active = false` — the table has no DELETE policy or grant at all — because a
deleted change order would silently rewrite the basis of commission that may already
have been paid.

RLS mirrors `jobs`: accounting, admin and CEO can read and write; the sales designer
and their manager can read change orders for jobs they can already see; `anon` has no
access. Writes are audited through the `job_change_orders_audit` trigger
(`job_change_order_created` / `_updated`, where a removal shows up as `active`
flipping to false), and changes to the original contract price, original cost and the
two roll-ups are audited by `jobs_financial_inputs_audit` as
`job_financial_inputs_changed`.

## Final commission audit (Phase 3.9)

Live financials are an estimate. `commission_audits` is the authoritative record, and
it is reached through an explicit workflow: **open → review → finalize → create the
final true-up**. It stores a snapshot, not a reference: the audited inputs, the plan
version, the tier label, the standard/draw/effective rates, the burden and warranty
percentages and dollars, the final gross commission, what had already been
recognized, and the resulting true-up.

| Guarantee | How it is enforced |
| --- | --- |
| Only one audit open at a time | partial unique index on `(job_id)` where `status = 'in_review'` |
| Finalized audits record who and when | `finalized_by`/`finalized_at` check constraint |
| Revisions are never renumbered or overwritten | `unique (job_id, revision)`; re-opening supersedes the old revision and inserts the next one |
| Audits are never deleted | no DELETE policy and no DELETE grant; cancelling marks a revision `superseded` |
| `anon` has no access | privileges revoked, no policy targets it |
| Finance/administrators only | insert/update policies require accounting, admin or CEO, and an insert must set `started_by = auth.uid()` |

Finalizing also writes `jobs.gp_audit_completed_date`, so the GP audit date is a
consequence of the audit rather than a field typed in beside normal job entry. The
final true-up action refuses to run without a finalized audit and records the audit
id and revision in the event's `calculation_metadata`, so the payout can always be
traced back to the snapshot it was based on.

## Project categories removed (Phase 4.1)

Project categories are no longer part of the commission system. Commission is
calculated from job revenue, job costs, burden, warranty contingency, change orders,
the resulting GP% and the attached plan version — nothing else. The rate comes from
the plan version's GP bands, so `threshold_type = 'project_minimum'` is no longer
reachable from the application: the tier form offers fixed bounds only, and the
validation rejects a category-relative bound. Tiers that already carry that type
still resolve (the resolver keeps the support) so historical plans load unchanged.

What changed in the database:

* every job was detached from its category (`project_category_id` set to null);
* `jobs.project_category_id` is now nullable, so a job is created and edited with no
  category at all.

**Retained, deliberately:** the column and the `project_categories` table are still
in the schema, marked `DORMANT` in their comments. Dropping the column means
rewriting `jobs_enforce_update_permissions` and `log_job_audit_event` in the same
migration, because both reference it by name — a mistake there would break every job
update rather than one screen, and the table also holds the only record of how the
existing job was categorised. Nothing in the application reads or writes either one
any more, so they can be dropped in a follow-up once those trigger bodies are
rewritten. `project_categories` keeps its RLS policies and its single historical row.

## Designer dashboards (Phase 4.2)

`/sales/commissions/employees` and `/sales/commissions/employees/[id]` are a read-only composition
layer: no schema change, no new calculation. A designer's dashboard is assembled from
the commission workspace (jobs, events, ledgers, plans, tiers — already loaded in
batch by the other commission screens) plus a single `commission_audits` query for
that designer's jobs, so there is no per-job round trip. Every money figure comes from
the canonical engine's projection or from a commission event's own snapshot.

Visibility is decided by Row Level Security, not by the layout: finance and
administrators see everything the policies allow, and a sales designer opening their
own dashboard gets their own events, ledgers and draw periods while the compensation
configuration their role cannot read simply comes back empty. The page renders that
state honestly ("not visible to your role") instead of showing blanks.
