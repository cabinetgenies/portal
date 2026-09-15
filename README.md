# Cabinet Genies Portal

Internal operations portal for Cabinet Genies.

- **Phase 1 (done):** authentication, the user and role model, the protected
  application shell, the dashboard shell, the navigation architecture and
  placeholder module routes.
- **Phase 2 (done):** the commission domain — jobs, sales-designer assignment,
  project categories with their own minimum GP standards, commission plans with
  effective-dated versions and GP tiers, employee commission settings and dated
  plan assignments, job financials with job vs. commissionable gross profit,
  append-only adjustments and an audit trail.
- **Phase 3 preparation (done):** the shared compensation layer generalised for
  future Sales Manager compensation — a participant kind on plans, effective-dated
  manager relationships with attribution primitives, and a documented extension
  point. No manager bonus is calculated, approved or paid.
- **Phase 3 (done):** the sales designer commission engine — configurable tiers,
  projected and final audited commission, deposit payout, final true-up, negative
  true-up rollover, draw against commission with immutable ledgers, approval and
  payment workflow, employee commission dashboard and commission settings UI.
- **Phase 3.5 (done):** the user directory — a live table over `public.profiles`
  with role, department, manager, status and each person's commission setup,
  account creation through the Supabase Auth Admin API (or linking an existing
  Auth user when the server-only service role key is not configured), and an
  append-only audit trail for user and commission-setup changes.
- **Phase 3.6 (done):** the commission job entry workflow — a job list with
  revenue, cost, commissionable GP, deposit and GP-audit status and projected
  commission; a New job form that captures identity, the governing plan version,
  the revenue and cost structure and the milestone dates, with a live read-only
  calculation from the shared engine; and a job detail page organised into
  Overview, Financials, Commission and events/history. No migration was required.
- **Phase 3.7 (done):** percentage-based burden and warranty / service contingency —
  both are configurable company defaults with a per-job override and snapshot, derive
  their dollar amounts from direct job cost through the one canonical calculation,
  and are included in total job cost before the commission tier is selected. The
  company defaults are 0% until Cabinet Genies sets its real percentages.
- **Phase 3.8 (done):** simplified job financials plus change orders — original
  contract price, one original cost figure, and change orders as child records with
  a number/name, revenue and cost, rolled up by the canonical calculation. The four
  old cost buckets are folded into `original_cost` and no longer surface in the UI;
  add, edit and remove all recalculate the live summary.
- **Phase 3.9 (done):** the final commission audit as its own workflow — opened
  deliberately on the job page, reviewed against the complete live financial picture,
  then finalized into an append-only snapshot of the inputs, plan version, tier,
  rates, burden and warranty percentages and the resulting true-up. The final true-up
  is created separately from that snapshot, and a GP audit date on its own no longer
  unlocks it.
- **Phase 4 (done):** the Sales Designer commission bands changed to seven fixed
  gross-profit bands (0% below 30% GP, then 5/10/15/20/25/30% from 30/35/40/45/47/49%),
  seeded as a new effective-dated version of the production plan with a rate card on
  the commission rules page. No interpolation, and no band rate in code.
- **Phase 4.1 (done):** project categories were removed from the commission system.
  A commission job no longer belongs to a category, no rate resolution or audit reads
  a category minimum GP, `/admin/project-categories` is gone from the navigation and
  the routes, and category-relative band bounds can no longer be created. The dormant
  `project_categories` table and `jobs.project_category_id` column are retained for
  historical reference only (see supabase/README.md).

Sales manager bonus calculation and payout, support designer bonuses, split
commissions, production performance bonuses, payroll batching, Buildertrend
integration, the sales pipeline, project management, production scheduling and
notifications are intentionally **not** implemented yet.

Two rules are structural, not conventions: a job has exactly **one** sales
designer and Cabinet Genies does **not** split commissions, so there is no split
table and no share-of-someone-else column anywhere. Manager compensation will be
its own bonus/override on qualifying jobs. See
[docs/compensation-architecture.md](docs/compensation-architecture.md).

The commission engine itself — tier resolution, deposit payout, final true-up,
rollover, draw and the canonical offset order — is documented in
[docs/commission-engine.md](docs/commission-engine.md).

## Stack

- Next.js 16.3 (App Router, Turbopack, `proxy.ts` instead of `middleware.ts`)
- React 19.2
- TypeScript
- Tailwind CSS 4
- Supabase (Auth + Postgres with Row Level Security)
- Zod (shared validation for forms and Server Actions)
- Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev
```

Required environment variables (see [`.env.example`](.env.example)):

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (publishable) key. Safe in the browser — RLS enforces access. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Server-only. Not required for authentication, only for privileged admin work in a later phase. |

If the two required variables are missing, the portal renders an explicit
configuration notice instead of failing with a stack trace.

## Supabase

Run
[`supabase/migrations/20260915090000_create_profiles.sql`](supabase/migrations/20260915090000_create_profiles.sql)
in the Supabase SQL editor (or `supabase db push` once the CLI is linked), then
create your first users in Supabase Auth. Details, including how to promote the
first administrator, are in [`supabase/README.md`](supabase/README.md).

## Routes

| Route | Access | Phase 1 content |
| --- | --- | --- |
| `/login` | public | Email and password sign-in |
| `/home` | authenticated | Dashboard shell, workspace cards, activity empty state |
| `/commissions` | authenticated | Commission dashboard: projected, pending, approved, paid, draw and rollover cards plus action queues (employees see their own commission instead) |
| `/commissions/payments` | accounting+ | Approval and payment workflow, void-with-reason, immutable paid history |
| `/commissions/jobs` | scoped by role | Live job list: revenue, GP, GP %, commissionable GP |
| `/commissions/jobs/new` | admin / CEO | Create a job |
| `/commissions/jobs/[id]` | scoped by role | Overview, Financials, Commission setup, Commission (projected/final breakdown, events, workflow), Audit / adjustments |
| `/commissions/employees` | accounting+ | Eligibility, plan, draw status, balances, projected/pending/paid figures and per-employee ledgers |
| `/commissions/rules` | accounting+ | Read-only plan tiers plus the current rule inputs |
| `/sales`, `/projects`, `/production`, `/reports` | authenticated | Placeholder module screens |
| `/admin`, `/admin/users` | admin / CEO | Administration shell, current profile, role model |
| `/admin/compensation-plans` | admin / CEO | Manage compensation plans, versions and tiers (sales designer plans today; manager plans reserved) |
| `/admin/commission-settings` | admin / CEO | Deposit payout %, draw rate reduction, draw system on/off, effective-dated history |
| `/` | public | Redirects to `/home` or `/login` based on session |

## Architecture

```
app/
  (auth)/login/          Public sign-in route
  (app)/                 Authenticated shell and protected routes
  error.tsx, global-error.tsx, not-found.tsx
components/
  app-shell/             Sidebar, mobile drawer, user panel, nav list
  commission/            Job, commission engine, draw and ledger form components
  compensation/          Plan and settings form components
  commissions/, admin/   Module-specific navigation
  page-header/, metric-card/, empty-state/, module-card/, configuration-notice/
  ui/                    Small shared primitives (form fields, tables, panels, badges)
lib/
  auth/                  Data access layer (session checks) and Server Actions
  compensation/          Compensation vocabulary, effective-dated plan resolution,
                         manager attribution, validation, queries, Server Actions
  commission/            Job domain and commission engine: financial math, tier
                         and offset engine, event workflow, draw/rollover
                         ledgers, queries, Server Actions and unit tests
  forms/                 Shared action-state and database-error helpers
  permissions/           Roles, capabilities, navigation configuration
  supabase/              Browser, server, proxy and admin clients plus DB types
  utils/                 Formatting and class-name helpers
proxy.ts                 Session refresh and optimistic route protection
supabase/migrations/     Database schema and RLS
scripts/                 Node loader that lets `npm test` run the TypeScript tests
```

Security model in one line: `proxy.ts` refreshes sessions and redirects early,
`lib/auth/dal.ts` verifies every server-side read, and Row Level Security in
Postgres is the final authority on what any user can see.

## Scripts

```bash
npm run dev      # development server
npm run build    # production build
npm run start    # run the production build
npm run lint     # ESLint
npm run typecheck # tsc --noEmit
npm test         # unit tests for the pure commission domain functions
```

The tests cover the financial domain (revenue, credits, cost, gross profit, gross
profit percentage, zero-revenue behaviour, commissionable gross profit and
adjustments) and effective-dated plan resolution (version windows, sale
snapshots). Band thresholds measured relative to a project category's minimum GP
standard remain supported for tiers that already carry that type, but no new tier can
be configured that way — project categories were removed from the commission system.
They need no database and no Supabase instance.
