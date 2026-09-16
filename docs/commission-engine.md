# Sales designer commission engine

How a Cabinet Genies sales designer's commission is calculated, paid and kept
honest over time. The code that implements this document lives in
`lib/commission/engine.ts` (pure functions, unit tested) with the Server Actions in
`lib/commission/events-actions.ts` and `lib/commission/draw-actions.ts`.

Nothing in the UI implements its own formula: previews and stored events both call
the same engine.

## Job cost, and the percentage base

Burden and warranty / service contingency are **percentages**, not dollar inputs.
The rule lives once, in `lib/commission/financials.ts`, and is applied before the
commission tier is selected:

```
original_revenue             = original contract price (jobs.contract_revenue)
change_order_revenue         = sum(active change orders' revenue)
total_revenue                = original contract price + change order revenue
                               (+ other revenue − credits)

original_cost                = jobs.original_cost
change_order_cost            = sum(active change orders' cost)
direct_job_cost              = original_cost + change_order_cost

burden_cost                  = round(direct_job_cost × burden_percent)
warranty_service_contingency = round(direct_job_cost × warranty_contingency_percent)
total_job_cost               = direct_job_cost + burden_cost + warranty_service_contingency
```

Change orders are child records (`job_change_orders`), not aggregates typed onto the
job: a number/name, revenue and cost each. `jobs.change_order_revenue` and
`jobs.change_order_cost` are the derived roll-ups of the *active* rows, written by
the canonical calculation. Removing a change order deactivates it rather than
deleting it, so the history survives once commission has been paid against it.

**The base is direct job cost** — original costs plus change order costs, before either adder.
Neither rate is applied to revenue: both are cost-side reserves, and a share of
revenue would inflate cost on high-revenue jobs. Until Phase 3.7 the two amounts
were raw dollar columns with no stated basis anywhere in this document or in the
schema, so the base is defined here deliberately and marked on the columns the
migration added.

Where the numbers come from:

| Layer | Columns | Edited by |
| --- | --- | --- |
| Company defaults | `commission_settings.burden_percent`, `.warranty_contingency_percent` (effective-dated) | Admin/CEO; accounting can view |
| Per-job snapshot | `jobs.burden_percent`, `jobs.warranty_contingency_percent` | Admin/CEO on the job form |
| Stored dollars | `jobs.burden_cost`, `jobs.warranty_service_contingency` | Nobody — derived, then stored |

The defaults are 0% until Cabinet Genies sets its real numbers under
Admin → Commission settings. The percentages in force are always shown on the job
form and the job detail page, so nothing about the cost basis is hidden.

**Historical protection.** A job keeps the rates it was saved with, and a
commission event snapshots the commissionable GP and rates it was calculated from.
Changing the company defaults therefore cannot rewrite an existing job's cost
structure or any approved or paid commission event. Only a job that has never been
saved with a rate falls back to the default in force.

## The final commission audit

Two figures exist for every job, and they are deliberately different things:

| | What it is | What it feeds |
| --- | --- | --- |
| Projected commission | The live estimate from the job's current financials | The **deposit** payout |
| Final audited commission | The snapshot taken when the audit is finalized | The **final true-up** |

The audit is a workflow, not a field: `Begin Final Commission Audit` opens a revision
in review, the review screen shows the complete picture (original contract price,
original costs, every change order, burden and warranty percentages and dollars,
final totals, GP and GP %, the tier and rates, the final gross commission, what has
already been recognized, and the resulting true-up), and finalizing locks those
figures with `finalized_by` and `finalized_at`.

Two rules come out of that separation. A final true-up is never created because
someone recorded a GP audit date — the date is written *by* finalization, and the
true-up action refuses to run unless a finalized audit exists. And an audit is never
edited in place: re-opening supersedes the old revision and starts the next one, so a
measurement that has already been paid against stays on the record.

## 1. Rate resolution

Commission is based on **commissionable gross profit**, and the gross-profit
percentage is measured *after* burden is included in job cost. Both figures come
from the canonical job financial calculation (`lib/commission/financials.ts`);
there is no second GP formula.

The tier comes from the plan version attached to the job
(`jobs.compensation_plan_version_id`), which must belong to a plan whose
`participant_kind` is `sales_designer`:

Current bands (version `v2`, effective 2026-09-15):

| Commissionable GP % | Standard rate |
| --- | --- |
| ≥ 49% | 30% |
| ≥ 47% and < 49% | 25% |
| ≥ 45% and < 47% | 20% |
| ≥ 40% and < 45% | 15% |
| ≥ 35% and < 40% | 10% |
| ≥ 30% and < 35% | 5% |
| < 30% | 0% |

Below 30% GP is a hard floor: the rate is exactly zero, with no interpolation or
curve between bands. That bottom band is **open-ended on the lower side** (a null
lower bound, as v1's bottom band always was), so negative GP, zero GP and positive
GP under 30% all belong to it explicitly. A loss-making job therefore resolves to
the "Below 30%" band rather than matching nothing, which keeps it auditable: the
final audit reports that band at 0% instead of flagging a missing tier.

Those numbers are **configuration** (`compensation_plan_tiers`), not constants in
code — `lib/commission/financials.ts` and the engine resolve the rate from the rows.
Admin/CEO edit them through Admin → Compensation plans, and editing a schedule means
adding a new effective-dated version: version `v1` (30/20/10/0% at 50/45/35% GP)
stays on the record and remains the schedule every job, audit and commission event
calculated before 2026-09-15 was measured against. Bands are inclusive on the lower
bound and exclusive on the upper bound, and tiers are evaluated in `sort_order`
(highest band first).

`effective rate` = max(standard rate − draw reduction, 0)

## 2. Deposit payout

When `jobs.deposit_received_date` is recorded, the deposit commission becomes
eligible. No bank-cleared confirmation is required.

```
projected gross commission = commissionable GP × effective rate
deposit commission         = projected gross commission × deposit payout %
```

The deposit payout percentage is configuration (`commission_settings`,
default 0.50). The resulting event is created with `event_type = deposit` and
`status = pending_approval` — it is never automatically marked paid. Creating it
is idempotent: a partial unique index on `(job_id, event_type)` allows at most one
deposit event per job, and the action returns the existing state instead of
duplicating.

## 3. Final true-up

Once the job has a GP audit completion date (or is marked GP-audited/closed), the
final calculation re-runs the same pipeline against the **final** audited figures:

```
final gross commission = final commissionable GP × final effective rate
final true-up          = final gross commission − commission already recognized
```

"Already recognized" is the sum of `gross_commission` across the job's non-voided
events, clipped at zero for negative true-ups. `gross_commission` is the amount
credited before rollover/draw offsets are applied, so a deposit absorbed by draw
is still recognized. This keeps a job from ever paying more than it earned. The
final event is also idempotent (`event_type = final_true_up`, one per job).

If the true-up is **negative**, no negative payment is created. The absolute
amount becomes a **rollover obligation** instead, and the final event's
`net_payable` is 0.

## 4. Offsets: one canonical order

Earned commission is converted into cash payable in exactly this order:

1. **Outstanding rollover** — a negative true-up carried forward.
2. **Outstanding draw** — advances already paid to the employee.
3. **Remainder** — cash payable.

```
rollover offset = min(gross amount, outstanding rollover)
remaining       = gross amount − rollover offset
draw offset     = min(remaining, outstanding draw)
net payable     = remaining − draw offset
```

`calculateNetCommissionPayable` implements this once. Worked examples:

| Outstanding rollover | Outstanding draw | Gross earned | Rollover offset | Draw offset | Cash payable |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 3,000 | 5,000 | 1,000 | 3,000 | 1,000 |
| 1,000 | 3,000 | 900 | 900 | 0 | 0 |
| 4,000 | 0 | 2,500 | 2,500 | 0 | 0 (1,500 remains owed) |
| 0 | 5,000 | 3,000 | 0 | 3,000 | 0 (2,000 remains outstanding) |

## 5. Draw against commission

Draw is optional per employee and effective-dated (`employee_draw_periods`), so
enrollment has history rather than one mutable boolean. While an employee is
enrolled on the calculation date:

* the commission rate is reduced by an **absolute number of percentage points**
  (default 0.05 = 5 points, configurable in settings),
* the result is never below zero: 30→25, 20→15, 10→5, 0→0,
* the reduction is snapshotted on the event (`draw_rate_reduction`,
  `effective_commission_rate`).

It is never a multiplication of the rate by 95%.

## 6. Ledgers and sign conventions

Balances are always derived from append-only ledgers; no mutable balance column
exists. Both ledgers use the same convention: **positive increases what the
employee owes, negative reduces it.**

`employee_draw_ledger`

| Transaction type | Typical sign | Meaning |
| --- | --- | --- |
| `draw_advance` | + | An advance paid to the employee |
| `commission_offset` | − | Earned commission applied to the balance |
| `repayment` | − | Cash repaid |
| `manual_adjustment` | ± | Documented correction |

`commission_rollover_ledger`

| Transaction type | Typical sign | Meaning |
| --- | --- | --- |
| `negative_true_up` | + | Shortfall carried forward from a final true-up |
| `future_commission_offset` | − | Future commission absorbed the obligation |
| `manual_adjustment` | ± | Documented correction |

Outstanding draw = Σ draw ledger amounts; outstanding rollover = Σ rollover
ledger amounts. Database triggers reject any entry that would push either balance
below zero, and both ledgers reject UPDATE and DELETE. The SQL helpers
`employee_draw_balance(profile_id)`, `employee_rollover_balance(profile_id)` and
`is_profile_on_draw_at(profile_id, date)` mirror the TypeScript functions.

## 7. Approval and payment workflow

```
calculated → pending_approval → approved → paid
                    ↘ voided (unpaid only) ↗
```

* **accounting** — creates and recalculates events, submits them for approval,
  reads all commission financials. Cannot approve, pay, void, or change rules.
* **admin / CEO** — approve, mark paid, void an unpaid event with a reason, manage
  rules, manage draw enrollment, and record draw/rollover adjustments.

Ledger offsets are posted when an event is **approved**, because that is the
moment the money is committed. Approval recomputes the offsets from the balances
in force at that moment and posts at most one offset of each kind per event
(enforced by `employee_draw_ledger_event_key` / `commission_rollover_ledger_event_key`),
so a retried approval can never double-apply a draw or rollover.

Paid events are immutable and cannot be deleted; voiding an unpaid event reverses
anything it posted with mirror ledger entries, and the event keeps its snapshot
with `void_reason`, `voided_by` and `voided_at`.

## 8. Historical protection

Every event snapshots: commissionable GP and GP %, tier label, standard rate, draw
reduction, effective rate, job gross commission, deposit percentage, gross
amount, previously recognized amount, offsets and net payable, plus
`calculation_metadata` with the settings in force. Changing a rate, a tier, a plan
version or a setting therefore affects only future calculations — existing events
are never recomputed. A trigger blocks recalculation of an approved event
(`void it or create an adjustment instead`).

## 9. Not in this phase

Sales manager bonus calculations and payouts, support designer bonuses, split
commissions, production performance bonuses, payroll batching and the 50%
deposit / true-up mechanics for anyone other than a sales designer. Manager
compensation remains reserved (`participant_kind = 'sales_manager'`) and is
described in [compensation-architecture.md](compensation-architecture.md).
