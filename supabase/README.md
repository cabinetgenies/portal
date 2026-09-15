# Supabase setup

Apply the migrations in order. Phase 1 created `public.profiles` and its security
model; Phase 2 adds the commission domain.

| Order | Migration | What it creates |
| --- | --- | --- |
| 1 | `migrations/20260915090000_create_profiles.sql` | `profiles`, the `auth.users` trigger, RLS, role helpers |
| 2 | `migrations/20260915120000_create_commission_domain.sql` | project categories, commission plans, effective-dated versions, tiers, employee settings/assignments, jobs, financial adjustments, audit log, guard-rail triggers |
| 3 | `migrations/20260915120100_commission_domain_rls.sql` | Row Level Security policies and grants for the commission domain |
| 4 | `migrations/20260915120200_seed_sen_straight_gp_example.sql` | optional, editable sample plan (`SEN Straight GP Example`) |

Every script is idempotent, so re-running one is safe.

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
2. **Admin → Commission plans**: if you ran the optional seed, review
   `SEN Straight GP Example`. It is a sample, not the confirmed policy — rename,
   edit or delete it once the real plan is agreed.
3. Give the real plan an effective-dated version, then add its GP tiers. Tiers
   can reference the project's minimum GP standard instead of a fixed number
   (`threshold_type = project_minimum`).
4. **Commissions → Employees**: mark who is commission eligible and which plan
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

Commission domain (Phase 2):

| Table | Read | Write |
| --- | --- | --- |
| `project_categories` | any portal user (reference data) | admin, ceo |
| `commission_plans`, `commission_plan_versions`, `commission_tiers` | accounting, admin, ceo | admin, ceo |
| `employee_commission_settings`, `employee_commission_assignments` | accounting, admin, ceo | admin, ceo |
| `jobs` | own jobs (employee); own and direct reports' jobs (supervisor); all jobs (accounting, admin, ceo) | insert: admin, ceo. Update: accounting (financials, status and milestone dates only), admin, ceo. No delete for anyone — cancel instead |
| `job_financial_adjustments` | accounting, admin, ceo | insert only (append-only) |
| `audit_events` | accounting, admin, ceo | none — written only by SECURITY DEFINER triggers |

Anonymous (unauthenticated) requests can read nothing: table privileges for the
`anon` role are revoked and no policy grants it access.

Database guard rails on top of RLS:

* `jobs_protect_sold_plan` — a sold job's commission plan or version can only be
  changed by an administrator.
* `jobs_enforce_update_permissions` — accounting cannot change job identity,
  category, sales designer or plan assignment.
* `commission_plan_versions_prevent_overlap` and
  `employee_commission_assignments_prevent_overlap` — two active versions of one
  plan (or two assignments for one employee) cannot cover the same day.
* `job_financial_adjustments_no_update` plus the `audit_events` triggers — history
  rows are append-only.

## Derived job figures

`jobs.actual_total_*`, `jobs.job_gross_profit`, `jobs.job_gp_percent`,
`jobs.commissionable_*` and the commissionable percentages are **not** computed by
a database trigger. They are written by the application from the single shared
implementation in `lib/commission/financials.ts`, so exactly one calculation path
exists. Anything that changes a job's inputs or its adjustments recomputes them in
the same request.
