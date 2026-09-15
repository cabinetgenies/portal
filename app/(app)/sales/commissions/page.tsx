import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ActivityIcon, CommissionsIcon } from "@/components/icons";
import { MetricCard } from "@/components/metric-card/metric-card";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import {
  getCommissionDashboard,
  listEmployeeCommissionSummaries,
} from "@/lib/commission/event-queries";
import { toNumber } from "@/lib/commission/financials";
import { PROJECT_ROUTES } from "@/lib/routes";
import {
  commissionEventStatusLabel,
  commissionEventStatusTone,
  commissionEventTypeLabel,
} from "@/lib/commission/types";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils/format";

export const metadata = {
  title: "Commissions",
};

export default async function CommissionsPage() {
  const session = await requireSession();
  const canViewFinancials = session.capabilities.includes("view:financials");

  if (!canViewFinancials) {
    return <MyCommissionView />;
  }

  const dashboard = await getCommissionDashboard();
  const { cards, queues } = dashboard;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finance"
        title="Commission dashboard"
        description="Sales designer commission calculated from commissionable gross profit, with the draw and rollover balances that offset cash payable."
      />

      <section aria-label="Commission totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Projected commission"
          value={formatMoney(cards.projectedCommission)}
          hint="Open jobs, current commissionable GP"
          placeholder={false}
        />
        <MetricCard
          label="Pending approval"
          value={formatMoney(cards.pendingApproval)}
          hint="Calculated events awaiting approval"
          placeholder={false}
        />
        <MetricCard
          label="Approved / awaiting payment"
          value={formatMoney(cards.approvedAwaitingPayment)}
          hint="Approved but not yet marked paid"
          placeholder={false}
        />
        <MetricCard
          label="Paid this month"
          value={formatMoney(cards.paidThisMonth)}
          hint="Net payable marked paid this calendar month"
          placeholder={false}
        />
        <MetricCard
          label="Outstanding draw"
          value={formatMoney(cards.outstandingDraw)}
          hint="Advances not yet recovered from commission"
          placeholder={false}
        />
        <MetricCard
          label="Outstanding rollover"
          value={formatMoney(cards.outstandingRollover)}
          hint="Negative true-ups carried forward"
          placeholder={false}
        />
      </section>

      <QueuePanel
        id="deposit-ready"
        title="Deposit commissions ready"
        description="Jobs with a deposit received date and no deposit commission event yet."
        emptyLabel="No deposits are waiting for a commission calculation."
        jobs={queues.depositReady.map((item) => ({
          id: item.job.id,
          name: item.job.job_name,
          meta: `Deposit ${formatDate(item.job.deposit_received_date)}`,
          designer: item.designerName,
          amount: item.depositTarget,
        }))}
      />

      <QueuePanel
        id="final-audits-needed"
        title="Final GP audits needed"
        description="Jobs that are complete or need a GP audit before the final commission can be calculated."
        emptyLabel="No jobs are waiting on a GP audit."
        jobs={queues.finalAuditsNeeded.map((item) => ({
          id: item.job.id,
          name: item.job.job_name,
          meta: `Status ${item.job.status.replaceAll("_", " ")}`,
          designer: item.designerName,
          amount: item.projectedGrossCommission,
        }))}
      />

      <QueuePanel
        id="final-true-ups-ready"
        title="Final true-ups ready"
        description="GP-audited jobs with no final true-up event yet."
        emptyLabel="No audited jobs are waiting for a final true-up."
        jobs={queues.finalTrueUpsReady.map((item) => ({
          id: item.job.id,
          name: item.job.job_name,
          meta: item.job.gp_audit_completed_date
            ? `GP audited ${formatDate(item.job.gp_audit_completed_date)}`
            : "Marked GP audited",
          designer: item.designerName,
          amount: item.projectedGrossCommission,
        }))}
      />

      <Panel
        id="negative-true-ups"
        title="Negative true-ups / rollover"
        description="Employees carrying a rollover obligation. Future commission pays this down before any cash is paid."
      >
        {queues.negativeTrueUps.length === 0 ? (
          <EmptyState
            icon={<ActivityIcon className="h-5 w-5" />}
            title="No outstanding rollover balances."
            description="A negative final true-up would appear here, carried forward instead of creating a negative payment."
          />
        ) : (
          <TableWrap>
            <Table caption="Employees with an outstanding rollover balance">
              <thead>
                <tr>
                  <Th>Employee</Th>
                  <Th className="text-right">Outstanding rollover</Th>
                </tr>
              </thead>
              <tbody>
                {queues.negativeTrueUps.map((entry) => (
                  <tr key={entry.profile.id}>
                    <Td>
                      {[entry.profile.first_name, entry.profile.last_name]
                        .filter(Boolean)
                        .join(" ") || entry.profile.email}
                    </Td>
                    <TdNumeric>{formatMoney(entry.outstandingRollover)}</TdNumeric>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>

      <Panel
        id="payments-awaiting-approval"
        title="Payments awaiting approval"
        description="Commission events calculated and waiting on an approver."
        actions={
          <Link
            href="/sales/commissions/payments"
            className="text-sm font-medium text-ink-muted hover:text-ink"
          >
            Open payment workflow
          </Link>
        }
      >
        {queues.paymentsAwaitingApproval.length === 0 ? (
          <EmptyState
            icon={<CommissionsIcon className="h-5 w-5" />}
            title="Nothing is waiting for approval."
            description="Calculated deposit commissions and final true-ups appear here until they are approved."
          />
        ) : (
          <TableWrap>
            <Table caption="Commission events awaiting approval">
              <thead>
                <tr>
                  <Th>Job</Th>
                  <Th>Sales designer</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Net payable</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {queues.paymentsAwaitingApproval.map((entry) => (
                  <tr key={entry.event.id}>
                    <Td>
                      <Link
                        href={PROJECT_ROUTES.project(entry.event.job_id)}
                        className="font-medium text-ink underline-offset-4 hover:underline"
                      >
                        {entry.jobName ?? "Job"}
                      </Link>
                    </Td>
                    <Td className="text-ink-muted">{entry.designerName ?? "—"}</Td>
                    <Td>{commissionEventTypeLabel(entry.event.event_type)}</Td>
                    <Td>
                      <StatusBadge
                        label={commissionEventStatusLabel(entry.event.status)}
                        tone={commissionEventStatusTone(entry.event.status)}
                      />
                    </Td>
                    <TdNumeric>{formatMoney(toNumber(entry.event.net_payable))}</TdNumeric>
                    <Td className="text-ink-muted">{formatDateTime(entry.event.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}

type QueueJob = {
  id: string;
  name: string;
  meta: string;
  designer: string | null;
  amount: number | null;
};

function QueuePanel({
  id,
  title,
  description,
  emptyLabel,
  jobs,
}: {
  id: string;
  title: string;
  description: string;
  emptyLabel: string;
  jobs: QueueJob[];
}) {
  return (
    <Panel id={id} title={title} description={description}>
      {jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
          {emptyLabel}
        </p>
      ) : (
        <TableWrap>
          <Table caption={title}>
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Sales designer</Th>
                <Th>Detail</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <Td>
                    <Link
                      href={PROJECT_ROUTES.project(job.id)}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {job.name}
                    </Link>
                  </Td>
                  <Td className="text-ink-muted">{job.designer ?? "Unassigned"}</Td>
                  <Td className="text-ink-muted">{job.meta}</Td>
                  <TdNumeric>{job.amount === null ? "—" : formatMoney(job.amount)}</TdNumeric>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Panel>
  );
}

async function MyCommissionView() {
  const summaries = await listEmployeeCommissionSummaries();
  const session = await requireSession();
  const mine = summaries.find((summary) => summary.profile.id === session.userId) ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finance"
        title="My commission"
        description="Your commission events, draw balance and rollover balance. Company-wide commission data is limited to accounting and administrators."
      />

      {!mine ? (
        <EmptyState
          icon={<CommissionsIcon className="h-5 w-5" />}
          title="No commission record yet."
          description="Once a job you designed has a deposit recorded, the calculated commission appears here."
        />
      ) : (
        <>
          <section aria-label="My balances" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Outstanding draw"
              value={formatMoney(mine.drawBalance)}
              hint={mine.onDraw ? "Currently on draw" : "Not on draw"}
              placeholder={false}
            />
            <MetricCard
              label="Outstanding rollover"
              value={formatMoney(mine.rolloverBalance)}
              hint="Carried forward from a negative true-up"
              placeholder={false}
            />
            <MetricCard
              label="Pending approval"
              value={formatMoney(mine.pendingApproval)}
              hint="Awaiting approval"
              placeholder={false}
            />
            <MetricCard
              label="Approved / unpaid"
              value={formatMoney(mine.approvedUnpaid)}
              hint="Approved, not yet paid"
              placeholder={false}
            />
            <MetricCard
              label="Paid year to date"
              value={formatMoney(mine.paidYtd)}
              hint="Net payable marked paid this year"
              placeholder={false}
            />
          </section>

          <Panel
            id="my-commission-events"
            title="My commission events"
            description="Each event keeps the rates and figures it was calculated with."
          >
            {mine.events.length === 0 ? (
              <EmptyState
                icon={<CommissionsIcon className="h-5 w-5" />}
                title="No commission events yet."
                description="Deposit and final true-up events appear here as accounting processes your jobs."
              />
            ) : (
              <TableWrap>
                <Table caption="Your commission events">
                  <thead>
                    <tr>
                      <Th>Created</Th>
                      <Th>Type</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Rate</Th>
                      <Th className="text-right">Gross</Th>
                      <Th className="text-right">Net payable</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {mine.events.map((event) => (
                      <tr key={event.id}>
                        <Td className="text-ink-muted">
                          {formatDateTime(event.created_at)}
                        </Td>
                        <Td>{commissionEventTypeLabel(event.event_type)}</Td>
                        <Td>
                          <StatusBadge
                            label={commissionEventStatusLabel(event.status)}
                            tone={commissionEventStatusTone(event.status)}
                          />
                        </Td>
                        <TdNumeric>
                          {(toNumber(event.effective_commission_rate) * 100).toFixed(2)}%
                        </TdNumeric>
                        <TdNumeric>{formatMoney(toNumber(event.gross_commission))}</TdNumeric>
                        <TdNumeric>{formatMoney(toNumber(event.net_payable))}</TdNumeric>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
