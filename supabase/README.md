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

Every script is idempotent, so re-running one is safe.

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

1. **Admin → Project categories**: add the categories Cabinet Genies actually
   sells, each with its own minimum GP standard. Nothing is seeded here on
   purpose — categories are business data, and invented numbers would be treated
   as real later.
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
3. The `on_auth_user_created` trigger inserts the matching `profiles` row with
   the default role `employee`.
4. Promote the first administrator:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@cabinetgenies.com';
```

Run that `update` from the SQL editor (which uses the service role and bypasses
RLS). A signed-in non-admin cannot promote themselves — the
`profiles_protect_privileged_columns` trigger rejects the write.

Optional profile fields can also be supplied when creating a user, via user
metadata:

```json
{ "first_name": "Dana", "last_name": "Reed", "department": "Sales" }
```

## Verify

```sql
-- Every auth user should have exactly one profile row.
select u.id, u.email, p.role
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;
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
| `project_categories` | any portal user (reference data) | admin, ceo |
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
  category, sales designer or plan assignment.
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

## Derived job figures

`jobs.actual_total_*`, `jobs.job_gross_profit`, `jobs.job_gp_percent`,
`jobs.commissionable_*` and the commissionable percentages are **not** computed by
a database trigger. They are written by the application from the single shared
implementation in `lib/commission/financials.ts`, so exactly one calculation path
exists. Anything that changes a job's inputs or its adjustments recomputes them in
the same request.
