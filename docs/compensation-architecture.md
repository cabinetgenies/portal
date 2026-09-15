# Compensation architecture

How Cabinet Genies models pay for the people who sell, manage and deliver work —
and exactly where Sales Manager compensation will attach when it is built.

This document describes the model as it exists today. **No Sales Manager bonus or
override is calculated, approved or paid anywhere in the portal.** The structures
below exist so that adding it later does not rewrite Sales Designer commission
history.

## 1. Business rules encoded in the model

| Rule | Where it lives |
| --- | --- |
| A job has exactly one primary Sales Designer | `jobs.sales_designer_id` (single nullable FK). There is deliberately no split table. |
| Cabinet Genies does not split commissions | No share/ownership column exists on any table. `jobs.sales_designer_id` is the only attribution of design work. |
| A Sales Manager is compensated separately, not from the designer's commission | A manager plan is a plan in its own right (`compensation_plans.participant_kind = 'sales_manager'`). Nothing links it to a designer's compensation event as a percentage owner. |
| Manager relationships come from the existing architecture | `profiles.manager_id` remains the current reporting relationship and the basis for supervisor job visibility. |
| Historical manager relationships must not be rewritten | `employee_reporting_periods` records who managed whom, effective-dated, and is maintained automatically when `profiles.manager_id` changes. |
| Shared compensation structures must not assume designer payouts | Shared tables and services use *compensation* terminology and a `participant_kind`, with `compensation_event_types` reserving the vocabulary for future payout records. |

## 2. Vocabulary

| Term | Meaning |
| --- | --- |
| **Compensation plan** | A named, versioned set of rules for one participant kind. |
| **Participant kind** | Who the plan compensates: `sales_designer` (implemented) or `sales_manager` (reserved). |
| **Plan version** | An effective-dated version of a plan. Versions are never rewritten; a job keeps the version it was governed by. |
| **Tier** | A gross-profit band and the participant's own rate for that band. A rate is never a share of someone else's payout. |
| **Compensation event type** | The reserved vocabulary for payout records: `designer_job_commission` and `manager_team_bonus`. Declared in `lib/compensation/types.ts`; nothing writes or reads them yet. |
| **Qualifying job** | (Future) a job that satisfies a manager bonus plan's conditions — sold date, project category, GP threshold, team membership at the time. |
| **Team attribution** | Resolving which manager a job belongs to, as of a date, using reporting history rather than today's org chart. |

## 3. What exists today

```
compensation_plans ──< compensation_plan_versions ──< compensation_plan_tiers
        │
        └──< employee_compensation_assignments >── profiles ──< employee_reporting_periods
                       (dated plan membership)        │
                                                      └──< jobs (sales_designer_id)
                                                             │
                                                             └─ compensation_plan_id / _version_id
```

* **Rules** — `compensation_plans`, `compensation_plan_versions`,
  `compensation_plan_tiers`. Read by accounting/admin/CEO; written by admin/CEO.
* **Participation** — `employee_compensation_settings` (eligibility) and
  `employee_compensation_assignments` (dated plan membership, so a plan change
  adds history instead of overwriting it).
* **Relationships** — `profiles.manager_id` (current) plus
  `employee_reporting_periods` (history), with
  `manager_of_profile_at(profile_id, on_date)` and
  `direct_report_ids_at(manager_id, on_date)` as the documented access paths.
* **Jobs** — one `sales_designer_id` and the sales designer plan version that
  governs it. The database refuses to attach a `sales_manager` plan to a job
  (`validate_job_plan_reference`), so manager compensation can never be modelled
  as a job-level share of a designer's payout.
* **Money** — job revenue, cost, job gross profit and commissionable gross profit
  (`lib/commission/financials.ts`, one implementation). No payout is computed.

## 4. The extension point: Sales Manager Bonus Plan

The future feature decomposes into six stages. Each stage lists what exists now,
what must be added, and the invariant it must not break.

### 4.1 Sales Manager Bonus Plan

*Now:* a manager plan can be configured today with
`participant_kind = 'sales_manager'`, description, effective-dated versions and
tiers. The portal labels it "reserved" and produces no output from it.

*To add:* a plan type for the manager shape(s) — percentage of team gross profit,
percentage of team commissionable GP, fixed override on qualifying jobs,
threshold/volume/GP-performance bonuses — plus its evaluation service and the
constraint update in `COMPENSATION_PLAN_TYPES`. Each shape is added with the code
that evaluates it, so no plan can exist that the system cannot interpret.

*Invariant:* a manager plan never references a designer's compensation event as
an ownership percentage.

### 4.2 Qualifying jobs

*Now:* nothing selects qualifying jobs.

*To add:* a qualification service that reads a plan version's conditions against
`jobs` (status, `sold_date`, `project_category_id`, `job_gross_profit`,
`commissionable_gross_profit`). The job's financial figures already exist and are
the same ones designer commission will use.

*Invariant:* qualification is a *read* of job facts. It must not mutate job
financials, and it must not create a second GP calculation path — reuse
`lib/commission/financials.ts`.

### 4.3 Team attribution

*Now:* `employee_reporting_periods` plus
`manager_of_profile_at` / `direct_report_ids_at` (SQL) and
`lib/compensation/attribution.ts` (TypeScript, unit-tested) resolve the manager
in force on a date.

*To add:* snapshot the attribution on the job when it is sold, so a later org
change cannot move a bonus. The recommended shape is an additive, nullable
`jobs.qualifying_manager_id` (or a `job_manager_attribution` table if more than
one manager per job is ever needed), populated by the same "mark job sold" action
that snapshots the designer's plan version. Nothing consumes this column yet, so
it was intentionally not added in advance of the code that fills it.

*Invariant:* attribution uses the relationship in force on the qualifying date,
never the current `profiles.manager_id`. Historical rows are never re-pointed;
a correction is a new record.

### 4.4 Calculated manager bonus

*Now:* nothing calculates anything.

*To add:* a pure, unit-tested domain module (mirroring
`lib/commission/financials.ts`) that turns qualifying jobs + plan version + tiers
into a candidate bonus amount, plus a persisted result table
(`manager_bonus_calculations`) holding the plan version, the attributed manager,
the qualifying job set and the derived amount.

*Invariant:* the calculation records the plan version it used. Editing the plan
later must never change an existing calculation — the same rule that protects
designer commission history.

### 4.5 Approval and payment

*Now:* not modelled.

*To add:* approval state on the calculation, and payout records that reference a
compensation event type (`manager_team_bonus`). Payment approval, payroll
batching and the 50% deposit / true-up mechanics stay in the phase that owns
them, for designer and manager alike.

*Invariant:* designer and manager payouts are separate events. A manager payout
never reduces a designer payout, and no "split" concept is introduced.

### 4.6 Audit history

*Now:* `audit_events` is append-only, written by `SECURITY DEFINER` triggers
(job created, status changed, sales designer changed, project category changed,
compensation plan assigned, financials changed, adjustment created, config
changed).

*To add:* the manager pipeline records its own events with the same shape
(`entity_type`, `entity_id`, `action`, `changed_by`, `metadata`): plan assigned,
qualifying jobs resolved, bonus calculated, bonus approved, bonus paid, bonus
corrected.

*Invariant:* the calculation, approval and payment rows are append-only, as
`job_financial_adjustments` already is. Corrections are new records.

## 5. Naming rules for future work

1. Shared structures use *compensation* language, and say who they are for via
   `participant_kind`. Only job-specific objects mention the Sales Designer.
2. Anything that will eventually hold payout records uses an *event* name with a
   participant-aware type, not a designer-specific name.
3. Rules are versioned and effective-dated; records that were produced from a
   version keep that version id forever.
4. A rate is always the participant's own rate. There is no "share of" column,
   and there will not be one.

## 6. Explicitly not built

Commission dollar calculation, the 50% deposit payout, final true-up, payroll
batching, split commissions, change-order commission rules, negative true-up
handling, commission payment approvals, sales manager bonus calculation,
approval or payment, Buildertrend integration, and notifications.

## 7. How to confirm nothing is active

* `lib/compensation/types.ts` marks `sales_manager` as reserved and
  `IMPLEMENTED_PARTICIPANT_KINDS` contains only `sales_designer`.
* The database rejects a job that references a manager plan
  (`jobs_validate_plan_reference`).
* The compensation UI offers manager participant kinds as disabled options
  labelled "reserved".
* `npm test` asserts both facts
  (`lib/compensation/types.test.ts`), alongside the attribution tests that prove
  historical team membership resolves by date.
