import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  EmployeeCompensationAssignmentForm,
  EmployeeCompensationSettingsForm,
} from "@/components/compensation/employee-compensation-forms";
import {
  DrawAdvanceForm,
  DrawEnrollmentForm,
  LedgerAdjustmentForm,
} from "@/components/commission/draw-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { InfoIcon, LockIcon } from "@/components/icons";
import { MetricCard } from "@/components/metric-card/metric-card";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import {
  listCompensationPlanOptions,
  listEmployeeCompensationOverview,
  todayIso,
} from "@/lib/compensation/queries";
import {
  drawScheduleStatusLabel,
  filterCommissionEvents,
  HISTORY_FILTERS,
  isHistoryFilter,
  type LedgerTransactionRow,
  type PipelineItem,
} from "@/lib/commission/designer-dashboard";
import { getDesignerCommissionDashboard } from "@/lib/commission/designer-queries";
import { roleLabel } from "@/lib/permissions/roles";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Designer commission dashboard",
};

const SECTIONS = [
  { href: "#overview", label: "Overview" },
  { href: "#commissions", label: "Commissions" },
  { href: "#draw", label: "Draw" },
  { href: "#rollover", label: "Rollover" },
  { href: "#history", label: "History" },
  { href: "#plan", label: "Plan & eligibility" },
];

/**
 * A designer's personal commission dashboard.
 *
 * This is a compensation workspace, not an HR profile: what they are projected to
 * earn, what is waiting on approval or payment, what has been paid, what they owe
 * back through draw and rollover, and the history behind all of it. Row Level
 * Security decides the data: a sales designer viewing their own dashboard sees their
 * own commission, and the compensation configuration their role cannot read simply
 * comes back empty rather than being hidden by the layout.
 */
export default async function DesignerDashboardPage(
  props: PageProps<"/sales/commissions/employees/[id]">,
) {
  const { id } = await props.params;
  const searchParams = await props.searchParams;
  const session = await requireSession();

  const canViewFinance = session.capabilities.includes("view:compensation-config");
  const isSelf = session.userId === id;

  if (!canViewFinance && !isSelf) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="This commission dashboard is restricted"
        description="Commission dashboards are visible to accounting and administrators, and to a designer for their own commission."
      />
    );
  }

  const dashboard = await getDesignerCommissionDashboard(id);

  if (!dashboard) {
    notFound();
  }

  const canManageCompensation = session.capabilities.includes("manage:employee-compensation");
  const canManageDraw = session.capabilities.includes("manage:draw");

  const [overviewRows, plans] = await Promise.all([
    listEmployeeCompensationOverview(),
    canManageCompensation ? listCompensationPlanOptions() : Promise.resolve([]),
  ]);
  const overview = overviewRows.find((row) => row.profile.id === id) ?? null;
  const today = todayIso();

  const rawFilter = searchParams?.filter;
  const requestedFilter = Array.isArray(rawFilter) ? rawFilter[0] : rawFilter;
  const filter = isHistoryFilter(requestedFilter) ? requestedFilter : "all";
  const historyEvents = filterCommissionEvents(dashboard.summary.events, filter);

  const { metrics, pipeline, draw, rollover, summary } = dashboard;
  const planLabel = summary.planName ?? overview?.currentPlan?.name ?? null;
  const planVersionLabel = overview?.currentVersionName ?? null;
  const assignmentFrom = summary.assignmentEffectiveFrom ?? overview?.currentAssignment?.effective_from ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title={dashboard.name}
        description={`${planLabel ?? "No compensation plan assigned"} · ${roleLabel(summary.profile.role)}`}
        actions={
          <Link
            href="/sales/commissions/employees"
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Back to designers
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={summary.compensationEligible ? "Compensation eligible" : "Not compensation eligible"}
          tone={summary.compensationEligible ? "positive" : "neutral"}
        />
        <StatusBadge
          label={summary.onDraw ? "On draw" : "Not on draw"}
          tone={summary.onDraw ? "info" : "neutral"}
        />
        <span className="text-xs text-ink-muted">
          Plan effective {assignmentFrom ? formatDate(assignmentFrom) : "—"}
          {planVersionLabel ? ` · version ${planVersionLabel}` : ""}
        </span>
      </div>

      <section aria-label="Commission summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Projected"
          value={formatMoney(metrics.projected)}
          hint="Live estimate across active jobs"
          placeholder={false}
        />
        <MetricCard
          label="Pending approval"
          value={formatMoney(metrics.pendingApproval)}
          hint="Submitted, waiting on an approver"
          placeholder={false}
        />
        <MetricCard
          label="Ready to pay"
          value={formatMoney(metrics.readyToPay)}
          hint="Approved and unpaid"
          placeholder={false}
        />
        <MetricCard
          label="Paid this month"
          value={formatMoney(metrics.paidThisMonth)}
          hint={`${formatMoney(metrics.paidYtd)} paid year to date`}
          placeholder={false}
        />
        <MetricCard
          label="Paid YTD"
          value={formatMoney(metrics.paidYtd)}
          hint="Cash commission received this year"
          placeholder={false}
        />
        <MetricCard
          label="Outstanding draw"
          value={formatMoney(metrics.outstandingDraw)}
          hint="Advances to be earned back"
          placeholder={false}
        />
        <MetricCard
          label="Outstanding rollover"
          value={formatMoney(metrics.outstandingRollover)}
          hint="Offsets future commission before cash"
          placeholder={false}
        />
        <MetricCard
          label="Active jobs"
          value={String(pipeline.active.length)}
          hint="Jobs assigned to this designer"
          placeholder={false}
        />
      </section>

      <nav aria-label="Dashboard sections" className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {section.label}
          </a>
        ))}
      </nav>

      <Panel
        id="overview"
        title="Overview"
        description="Where this designer's commission stands today, and what needs attention next."
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeading title="Active jobs" count={pipeline.active.length} />
            {pipeline.active.length === 0 ? (
              <Quiet>
                No active commission jobs yet. Projects appear here once this designer is
                assigned to them.
              </Quiet>
            ) : (
              <ActiveJobsTable rows={pipeline.active.slice(0, 5)} />
            )}
          </section>

          <div className="grid gap-6 border-t border-line pt-6 lg:grid-cols-2">
            <section className="space-y-3">
              <SectionHeading title="Pending approval" count={pipeline.pendingApproval.length} />
              {pipeline.pendingApproval.length === 0 ? (
                <Quiet>Nothing is waiting on an approver.</Quiet>
              ) : (
                <CompactEventList items={pipeline.pendingApproval.slice(0, 5)} />
              )}
            </section>
            <section className="space-y-3">
              <SectionHeading title="Ready to pay" count={pipeline.readyToPay.length} />
              {pipeline.readyToPay.length === 0 ? (
                <Quiet>No approved commission is waiting on payment.</Quiet>
              ) : (
                <CompactEventList items={pipeline.readyToPay.slice(0, 5)} />
              )}
            </section>
          </div>

          <section className="space-y-3 border-t border-line pt-6">
            <SectionHeading title="Recent commission activity" />
            {dashboard.summary.events.length === 0 ? (
              <Quiet>
                No commission activity yet. The deposit commission becomes eligible once a
                deposit date is recorded on a job.
              </Quiet>
            ) : (
              <CompactEventList items={dashboard.recentEvents} />
            )}
          </section>
        </div>
      </Panel>

      <Panel
        id="commissions"
        title="Commission pipeline"
        description="Every commission item for this designer, grouped by where it is in the workflow. Each row opens the job behind it."
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <SectionHeading title="Active / projected" count={pipeline.active.length} />
            {pipeline.active.length === 0 ? (
              <Quiet>No active jobs are producing a projection.</Quiet>
            ) : (
              <ActiveJobsTable rows={pipeline.active} />
            )}
          </section>
          <PipelineGroup title="Pending approval" items={pipeline.pendingApproval} empty="Nothing is waiting on an approver." />
          <PipelineGroup title="Ready to pay" items={pipeline.readyToPay} empty="No approved commission is waiting on payment." />
          <PipelineGroup title="Paid" items={pipeline.paid} empty="No commission has been paid yet." />
          <PipelineGroup
            title="Final true-ups"
            items={pipeline.finalTrueUps}
            empty="No final true-up has been created. It follows a finalized final audit."
          />
        </div>
      </Panel>

      <Panel
        id="draw"
        title="Draw against commission"
        description="Advances are earned back through future commission. Draw lowers the rate by percentage points while it is in force; entries are append-only."
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Draw status" value={summary.onDraw ? "On draw" : "Not on draw"} />
            <Figure
              label="Rate reduction"
              value={`${draw.drawRateReduction * 100} percentage points`}
            />
            <Figure label="Outstanding draw" value={formatMoney(metrics.outstandingDraw)} />
            <Figure
              label="Draw since"
              value={summary.openDrawPeriodFrom ? formatDate(summary.openDrawPeriodFrom) : "Not enrolled"}
            />
          </div>

          <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Total advances" value={formatMoney(draw.totals.advances)} />
            <Figure
              label="Total commission offsets"
              value={formatMoney(draw.totals.commissionOffsets)}
            />
            <Figure
              label="Repayments & adjustments"
              value={formatMoney(draw.totals.repaymentsAndAdjustments)}
            />
            <Figure label="Current balance" value={formatMoney(draw.totals.balance)} strong />
          </dl>

          <section className="space-y-3 border-t border-line pt-4">
            <SectionHeading title="Draw schedule" count={draw.schedule.length} />
            {draw.schedule.length === 0 ? (
              <Quiet>This designer has never been enrolled in draw against commission.</Quiet>
            ) : (
              <TableWrap>
                <Table caption="Effective-dated draw enrollment history">
                  <thead>
                    <tr>
                      <Th>Draw period</Th>
                      <Th>Rate reduction</Th>
                      <Th>Status</Th>
                      <Th>Notes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {draw.schedule.map((period) => (
                      <tr key={period.id}>
                        <Td className="text-ink">
                          {formatDate(period.startDate)} →{" "}
                          {period.endDate ? formatDate(period.endDate) : "Present"}
                        </Td>
                        <Td className="text-ink-muted">
                          {period.rateReductionPoints} percentage points
                        </Td>
                        <Td>
                          <StatusBadge
                            label={drawScheduleStatusLabel(period.status)}
                            tone={period.status === "active" ? "info" : "neutral"}
                          />
                        </Td>
                        <Td className="text-ink-muted">{formatText(period.notes)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </section>

          <section className="space-y-3 border-t border-line pt-4">
            <SectionHeading title="Draw ledger" count={draw.ledger.length} />
            {draw.ledger.length === 0 ? (
              <Quiet>No draw transactions recorded.</Quiet>
            ) : (
              <LedgerTable rows={draw.ledger} balanceLabel="Draw balance" />
            )}
          </section>

          {canManageDraw ? (
            <section className="space-y-4 border-t border-line pt-4">
              <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                Draw administration
              </h3>
              <DrawEnrollmentForm
                profileId={id}
                onDraw={summary.onDraw}
                openPeriodFrom={summary.openDrawPeriodFrom}
                today={today}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <DrawAdvanceForm profileId={id} />
                <LedgerAdjustmentForm profileId={id} ledger="draw" />
              </div>
              <p className="text-xs leading-5 text-ink-subtle">
                Ledger entries are never edited or deleted: a correction is another entry with
                a documented reason.
              </p>
            </section>
          ) : null}
        </div>
      </Panel>

      <Panel
        id="rollover"
        title="Commission rollover"
        description="A negative final true-up becomes a rollover instead of a negative payment."
      >
        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-surface-muted p-4">
            <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
              Outstanding rollover
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">
              {formatMoney(rollover.balance)}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              Next commission will reduce this balance before cash is paid.
            </p>
          </div>

          <section className="space-y-3">
            <SectionHeading title="Rollover ledger" count={rollover.ledger.length} />
            {rollover.ledger.length === 0 ? (
              <Quiet>No rollover balance has been created.</Quiet>
            ) : (
              <LedgerTable rows={rollover.ledger} balanceLabel="Rollover balance" />
            )}
          </section>

          {canManageDraw ? (
            <section className="space-y-3 border-t border-line pt-4">
              <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                Rollover adjustment
              </h3>
              <LedgerAdjustmentForm profileId={id} ledger="rollover" />
            </section>
          ) : null}
        </div>
      </Panel>

      <Panel
        id="history"
        title="Commission history"
        description="Every commission event for this designer, with the rates and offsets it was calculated under."
      >
        <div className="space-y-4">
          <nav aria-label="Commission history filters" className="flex flex-wrap gap-2">
            {HISTORY_FILTERS.map((option) => {
              const active = option.id === filter;
              const href =
                option.id === "all"
                  ? `/sales/commissions/employees/${id}#history`
                  : `/sales/commissions/employees/${id}?filter=${option.id}#history`;

              return (
                <Link
                  key={option.id}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-full border border-line-strong bg-surface-muted px-3 py-1 text-xs font-medium text-ink"
                      : "rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-muted hover:text-ink"
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>

          {historyEvents.length === 0 ? (
            <Quiet>No commission events match this filter.</Quiet>
          ) : (
            <TableWrap>
              <Table caption="Commission events for this designer">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Job</Th>
                    <Th>Event</Th>
                    <Th className="text-right">GP %</Th>
                    <Th className="text-right">Rate</Th>
                    <Th className="text-right">Gross</Th>
                    <Th className="text-right">Rollover offset</Th>
                    <Th className="text-right">Draw offset</Th>
                    <Th className="text-right">Net payable</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {historyEvents.map((event) => (
                    <tr key={event.id}>
                      <Td className="text-ink-muted">{formatDateTime(event.created_at)}</Td>
                      <Td>
                        <Link
                          href={`/sales/commissions/jobs/${event.job_id}`}
                          className="text-ink underline-offset-4 hover:underline"
                        >
                          {jobNameFor(pipeline, event.job_id)}
                        </Link>
                      </Td>
                      <Td className="text-ink-muted">{event.event_type.replaceAll("_", " ")}</Td>
                      <TdNumeric>{formatPercent(Number(event.commissionable_gp_percent))}</TdNumeric>
                      <TdNumeric>{formatPercent(Number(event.effective_commission_rate))}</TdNumeric>
                      <TdNumeric>{formatMoney(Number(event.gross_commission))}</TdNumeric>
                      <TdNumeric>{formatMoney(Number(event.rollover_offset))}</TdNumeric>
                      <TdNumeric>{formatMoney(Number(event.draw_offset))}</TdNumeric>
                      <TdNumeric>{formatMoney(Number(event.net_payable))}</TdNumeric>
                      <Td>
                        <StatusBadge
                          label={event.status.replaceAll("_", " ")}
                          tone={
                            event.status === "paid"
                              ? "positive"
                              : event.status === "approved"
                                ? "info"
                                : event.status === "pending_approval"
                                  ? "warning"
                                  : "neutral"
                          }
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </div>
      </Panel>

      <Panel
        id="plan"
        title="Plan & eligibility"
        description="Compensation configuration for this designer. Only administrators can change it."
      >
        {overview ? (
          <div className="space-y-6">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
              <Figure
                label="Compensation eligible"
                value={overview.settings?.compensation_eligible ? "Eligible" : "Not eligible"}
              />
              <Figure label="Current plan" value={overview.currentPlan?.name ?? "No plan assigned"} />
              <Figure label="Plan version" value={overview.currentVersionName ?? "—"} />
              <Figure
                label="Effective from"
                value={
                  overview.currentAssignment
                    ? formatDate(overview.currentAssignment.effective_from)
                    : "—"
                }
              />
            </dl>

            {overview.assignmentHistory.length > 0 ? (
              <section className="space-y-3 border-t border-line pt-4">
                <SectionHeading title="Assignment history" count={overview.assignmentHistory.length} />
                <TableWrap>
                  <Table caption="Effective-dated compensation plan assignments">
                    <thead>
                      <tr>
                        <Th>Plan</Th>
                        <Th>Effective from</Th>
                        <Th>Effective to</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.assignmentHistory.map((assignment) => (
                        <tr key={assignment.id}>
                          <Td className="text-ink">{assignment.compensation_plan_id}</Td>
                          <Td className="text-ink-muted">{formatDate(assignment.effective_from)}</Td>
                          <Td className="text-ink-muted">
                            {assignment.effective_to ? formatDate(assignment.effective_to) : "Present"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </section>
            ) : null}

            {canManageCompensation ? (
              <section className="grid gap-6 border-t border-line pt-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                    Eligibility
                  </h3>
                  <EmployeeCompensationSettingsForm
                    profileId={id}
                    compensationEligible={overview.settings?.compensation_eligible ?? false}
                    notes={overview.settings?.notes ?? null}
                  />
                </div>
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                    Plan assignment
                  </h3>
                  <EmployeeCompensationAssignmentForm
                    profileId={id}
                    plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
                    defaultEffectiveFrom={today}
                  />
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm leading-6 text-ink-muted">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" />
            <span>
              Compensation configuration is not visible to your role. Your own commission
              figures are above, taken from the events and ledgers you can read.
            </span>
          </p>
        )}
      </Panel>
    </div>
  );
}

function jobNameFor(pipeline: { active: { job: { id: string; job_name: string } }[] }, jobId: string) {
  return pipeline.active.find((row) => row.job.id === jobId)?.job.job_name ?? "View job";
}

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
      {title}
      {count === undefined ? null : (
        <span className="ml-2 font-normal tracking-normal text-ink-muted normal-case">
          {count}
        </span>
      )}
    </h3>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">
      {children}
    </p>
  );
}

function Figure({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd
        className={
          strong
            ? "font-mono text-base font-semibold tabular-nums text-ink"
            : "text-sm break-words text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function ActiveJobsTable({
  rows,
}: {
  rows: {
    job: { id: string; job_name: string; customer_name: string | null; job_status?: string; status: string };
    projectedGrossCommission: number | null;
    depositTarget: number | null;
    commissionPaidToDate: number;
    estimatedRemaining: number | null;
    depositReceived: boolean;
    auditState: string;
  }[];
}) {
  return (
    <TableWrap>
      <Table caption="Active commission jobs for this designer">
        <thead>
          <tr>
            <Th>Job</Th>
            <Th className="text-right">Projected</Th>
            <Th className="text-right">Deposit target</Th>
            <Th className="text-right">Paid to date</Th>
            <Th className="text-right">Estimated remaining</Th>
            <Th>Deposit</Th>
            <Th>Final audit</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.job.id}>
              <Td>
                <Link
                  href={`/sales/commissions/jobs/${row.job.id}`}
                  className="text-ink underline-offset-4 hover:underline"
                >
                  {row.job.job_name}
                </Link>
                <span className="block text-xs text-ink-subtle">
                  {formatText(row.job.customer_name)}
                </span>
              </Td>
              <TdNumeric>{formatMoney(row.projectedGrossCommission)}</TdNumeric>
              <TdNumeric>{formatMoney(row.depositTarget)}</TdNumeric>
              <TdNumeric>{formatMoney(row.commissionPaidToDate)}</TdNumeric>
              <TdNumeric>{formatMoney(row.estimatedRemaining)}</TdNumeric>
              <Td>
                <StatusBadge
                  label={row.depositReceived ? "Received" : "Not received"}
                  tone={row.depositReceived ? "positive" : "neutral"}
                />
              </Td>
              <Td>
                <StatusBadge
                  label={row.auditState.replaceAll("_", " ")}
                  tone={row.auditState === "settled" ? "positive" : "neutral"}
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

function PipelineGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: PipelineItem[];
  empty: string;
}) {
  return (
    <section className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <SectionHeading title={title} count={items.length} />
      {items.length === 0 ? (
        <Quiet>{empty}</Quiet>
      ) : (
        <TableWrap>
          <Table caption={`${title} commission items`}>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Job</Th>
                <Th>Event</Th>
                <Th className="text-right">GP %</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">Rollover offset</Th>
                <Th className="text-right">Draw offset</Th>
                <Th className="text-right">Net payable</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <Td className="text-ink-muted">{formatDateTime(item.date)}</Td>
                  <Td>
                    <Link
                      href={`/sales/commissions/jobs/${item.jobId}`}
                      className="text-ink underline-offset-4 hover:underline"
                    >
                      {item.jobName}
                    </Link>
                  </Td>
                  <Td className="text-ink-muted">{item.eventTypeLabel}</Td>
                  <TdNumeric>{formatPercent(item.gpPercent)}</TdNumeric>
                  <TdNumeric>{formatPercent(item.effectiveRate)}</TdNumeric>
                  <TdNumeric>{formatMoney(item.grossCommission)}</TdNumeric>
                  <TdNumeric>{formatMoney(item.rolloverOffset)}</TdNumeric>
                  <TdNumeric>{formatMoney(item.drawOffset)}</TdNumeric>
                  <TdNumeric>{formatMoney(item.netPayable)}</TdNumeric>
                  <Td>
                    <StatusBadge label={item.statusLabel} tone={item.statusTone} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}

function CompactEventList({ items }: { items: PipelineItem[] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
          <span className="min-w-0 text-sm text-ink">
            {item.jobName ? (
              <Link
                href={`/sales/commissions/jobs/${item.jobId}`}
                className="underline-offset-4 hover:underline"
              >
                {item.jobName}
              </Link>
            ) : (
              <Link
                href={`/sales/commissions/jobs/${item.jobId}`}
                className="underline-offset-4 hover:underline"
              >
                View job
              </Link>
            )}
            <span className="block text-xs text-ink-subtle">
              {item.eventTypeLabel} · {formatDate(item.date)}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span className="font-mono text-sm tabular-nums text-ink">
              {formatMoney(item.netPayable)}
            </span>
            <StatusBadge label={item.statusLabel} tone={item.statusTone} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function LedgerTable({
  rows,
  balanceLabel,
}: {
  rows: LedgerTransactionRow[];
  balanceLabel: string;
}) {
  return (
    <TableWrap>
      <Table caption={`${balanceLabel} transaction history`}>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Type</Th>
            <Th>Job</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Balance impact</Th>
            <Th>Reason</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <Td className="text-ink-muted">{formatDateTime(row.date)}</Td>
              <Td className="text-ink">{row.typeLabel}</Td>
              <Td className="text-ink-muted">
                {row.jobId ? (
                  <Link
                    href={`/sales/commissions/jobs/${row.jobId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {row.jobName ?? "View job"}
                  </Link>
                ) : (
                  "—"
                )}
              </Td>
              <TdNumeric>{formatMoney(row.amount)}</TdNumeric>
              <TdNumeric>{formatMoney(row.balanceAfter)}</TdNumeric>
              <Td className="text-ink-muted">{row.reason}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
