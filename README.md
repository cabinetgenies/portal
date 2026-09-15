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

Commission *payout* math, the 50% deposit payout, true-up, payroll batching,
Buildertrend integration, split commissions, payment approvals, the sales
pipeline, project management, production scheduling and notifications are
intentionally **not** implemented yet.

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
| `/commissions` | authenticated | Module dashboard. Payments and reports remain placeholders |
| `/commissions/jobs` | scoped by role | Live job list: revenue, GP, GP %, commissionable GP |
| `/commissions/jobs/new` | admin / CEO | Create a job |
| `/commissions/jobs/[id]` | scoped by role | Overview, Financials, Commission setup, Audit / adjustments |
| `/commissions/employees` | accounting+ | Commission eligibility and dated plan assignments |
| `/commissions/rules` | accounting+ | Read-only plans, versions and tiers |
| `/sales`, `/projects`, `/production`, `/reports` | authenticated | Placeholder module screens |
| `/admin`, `/admin/users` | admin / CEO | Administration shell, current profile, role model |
| `/admin/project-categories` | admin / CEO | Manage project categories and minimum GP standards |
| `/admin/commission-plans` | admin / CEO | Manage plans, versions and tiers |
| `/` | public | Redirects to `/home` or `/login` based on session |

## Architecture

```
app/
  (auth)/login/          Public sign-in route
  (app)/                 Authenticated shell and protected routes
  error.tsx, global-error.tsx, not-found.tsx
components/
  app-shell/             Sidebar, mobile drawer, user panel, nav list
  commission/            Job, plan, category and employee commission forms
  commissions/, admin/   Module-specific navigation
  page-header/, metric-card/, empty-state/, module-card/, configuration-notice/
  ui/                    Small shared primitives (form fields, tables, panels, badges)
lib/
  auth/                  Data access layer (session checks) and Server Actions
  commission/            Domain types, financial math, plan resolution, validation,
                         queries, Server Actions and unit tests
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
snapshots, tier thresholds relative to a project category's minimum GP standard).
They need no database and no Supabase instance.
