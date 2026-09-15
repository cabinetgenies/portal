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
import { LockIcon, UsersIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import {
  listCompensationPlanOptions,
  todayIso,
} from "@/lib/compensation/queries";
import {
  listEmployeeCommissionSummaries,
  type EmployeeCommissionSummary,
} from "@/lib/commission/event-queries";
import {
  commissionEventStatusLabel,
  commissionEventTypeLabel,
  DRAW_TRANSACTION_TYPE_LABELS,
  isDrawTransactionType,
  isRolloverTransactionType,
  ROLLOVER_TRANSACTION_TYPE_LABELS,
} from "@/lib/commission/types";
import { toNumber } from "@/lib/commission/financials";
import { roleLabel } from "@/lib/permissions/roles";
import { formatDate, formatDateTime, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Employees",
};

export default async function CommissionEmployeesPage() {
  const session = await requireSession();
  const canView = session.capabilities.includes("view:compensation-config");

  if (!canView) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Commission setup is restricted"
        description="Commission eligibility, draw status and balances are visible to accounting and administrators."
      />
    );
  }

  const canManageCompensation = session.capabilities.includes(
    "manage:employee-compensation",
  );
  const canManageDraw = session.capabilities.includes("manage:draw");
  const canManagePlans = session.capabilities.includes("manage:compensation-config");

  const [employees, plans] = await Promise.all([
    listEmployeeCommissionSummaries(),
    canManageCompensation ? listCompensationPlanOptions() : Promise.resolve([]),
  ]);
  const today = todayIso();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Employees"
        description="Who is commission eligible, which plan applies to them, whether they are on draw, and what they are owed. Draw and rollover balances are derived from their ledgers."
      />

      {employees.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="No portal users yet."
          description="Portal users are created in Supabase Authentication. Once they exist, eligibility, plan assignment and draw status are managed here."
        />
      ) : (
        <TableWrap>
          <Table caption="Employees with commission eligibility, draw status and balances">
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Eligible</Th>
                <Th>Current plan</Th>
                <Th>Draw status</Th>
                <Th className="text-right">Outstanding draw</Th>
                <Th className="text-right">Outstanding rollover</Th>
                <Th className="text-right">Projected commission</Th>
                <Th className="text-right">Pending approval</Th>
                <Th className="text-right">Approved / unpaid</Th>
                <Th className="text-right">Paid YTD</Th>
                <Th>Setup</Th>
              </tr>
            </thead>
            <tbody>
              {employees.map((row) => (
                <tr key={row.profile.id} className="align-top">
                  <Td>
                    <span className="font-medium text-ink">
                      {[row.profile.first_name, row.profile.last_name]
                        .filter(Boolean)
                        .join(" ") || formatText(row.profile.display_name)}
                    </span>
                    <span className="block text-xs text-ink-subtle">
                      {formatText(row.profile.email)} · {roleLabel(row.profile.role)}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge
                      label={row.compensationEligible ? "Eligible" : "Not eligible"}
                      tone={row.compensationEligible ? "positive" : "neutral"}
                    />
                  </Td>
                  <Td className="text-ink-muted">{formatText(row.planName)}</Td>
                  <Td>
                    <StatusBadge
                      label={row.onDraw ? "On draw" : "Standard rate"}
                      tone={row.onDraw ? "info" : "neutral"}
                    />
                    {row.openDrawPeriodFrom ? (
                      <span className="block text-xs text-ink-subtle">
                        since {formatDate(row.openDrawPeriodFrom)}
                      </span>
                    ) : null}
                  </Td>
                  <TdNumeric>{formatMoney(row.drawBalance)}</TdNumeric>
                  <TdNumeric>{formatMoney(row.rolloverBalance)}</TdNumeric>
                  <TdNumeric>{formatMoney(row.projectedCommission)}</TdNumeric>
                  <TdNumeric>{formatMoney(row.pendingApproval)}</TdNumeric>
                  <TdNumeric>{formatMoney(row.approvedUnpaid)}</TdNumeric>
                  <TdNumeric>{formatMoney(row.paidYtd)}</TdNumeric>
                  <Td>
                    <details className="min-w-[26rem]">
                      <summary className="cursor-pointer text-sm font-medium text-ink">
                        Manage
                      </summary>
                      <EmployeeAdminPanel
                        row={row}
                        plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
                        today={today}
                        canManageCompensation={canManageCompensation}
                        canManageDraw={canManageDraw}
                        canManagePlans={canManagePlans}
                      />
                    </details>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}

function EmployeeAdminPanel({
  row,
  plans,
  today,
  canManageCompensation,
  canManageDraw,
  canManagePlans,
}: {
  row: EmployeeCommissionSummary;
  plans: { id: string; name: string }[];
  today: string;
  canManageCompensation: boolean;
  canManageDraw: boolean;
  canManagePlans: boolean;
}) {
  return (
    <div className="mt-3 space-y-5 rounded-lg border border-line bg-surface-muted p-3">
      {canManageCompensation ? (
        <section className="space-y-4">
          <EmployeeCompensationSettingsForm
            profileId={row.profile.id}
            compensationEligible={row.compensationEligible}
            notes={row.compensationNotes}
          />
          <div className="border-t border-line pt-4">
            <EmployeeCompensationAssignmentForm
              profileId={row.profile.id}
              plans={plans}
              defaultEffectiveFrom={today}
            />
          </div>
        </section>
      ) : null}

      {canManageDraw ? (
        <section className="space-y-4 border-t border-line pt-4">
          <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Draw against commission
          </h3>
          <DrawEnrollmentForm
            profileId={row.profile.id}
            onDraw={row.onDraw}
            openPeriodFrom={row.openDrawPeriodFrom}
            today={today}
          />
          <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
            <DrawAdvanceForm profileId={row.profile.id} />
            <LedgerAdjustmentForm profileId={row.profile.id} ledger="draw" />
            <LedgerAdjustmentForm profileId={row.profile.id} ledger="rollover" />
          </div>
        </section>
      ) : null}

      {row.drawPeriods.length > 0 ? (
        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Draw history
          </h3>
          <ul className="space-y-1 text-xs text-ink-muted">
            {row.drawPeriods.map((period) => (
              <li key={period.id}>
                {formatDate(period.effective_from)} →{" "}
                {period.effective_to ? formatDate(period.effective_to) : "current"}
                {period.notes ? ` · ${period.notes}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
          Draw ledger
        </h3>
        {row.drawLedger.length === 0 ? (
          <p className="text-xs text-ink-muted">No draw ledger entries.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-muted">
            {row.drawLedger.map((entry) => (
              <li key={entry.id} className="flex justify-between gap-4">
                <span>
                  {formatDate(entry.created_at)} ·{" "}
                  {isDrawTransactionType(entry.transaction_type)
                    ? DRAW_TRANSACTION_TYPE_LABELS[entry.transaction_type]
                    : entry.transaction_type}{" "}
                  · {entry.reason}
                </span>
                <span className="font-mono tabular-nums">
                  {formatMoney(toNumber(entry.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
          Rollover ledger
        </h3>
        {row.rolloverLedger.length === 0 ? (
          <p className="text-xs text-ink-muted">No rollover ledger entries.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-muted">
            {row.rolloverLedger.map((entry) => (
              <li key={entry.id} className="flex justify-between gap-4">
                <span>
                  {formatDate(entry.created_at)} ·{" "}
                  {isRolloverTransactionType(entry.transaction_type)
                    ? ROLLOVER_TRANSACTION_TYPE_LABELS[entry.transaction_type]
                    : entry.transaction_type}{" "}
                  · {entry.reason}
                </span>
                <span className="font-mono tabular-nums">
                  {formatMoney(toNumber(entry.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 border-t border-line pt-4">
        <h3 className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
          Commission events
        </h3>
        {row.events.length === 0 ? (
          <p className="text-xs text-ink-muted">No commission events yet.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-muted">
            {row.events.map((event) => (
              <li key={event.id} className="flex justify-between gap-4">
                <span>
                  {formatDateTime(event.created_at)} ·{" "}
                  {commissionEventTypeLabel(event.event_type)} ·{" "}
                  {commissionEventStatusLabel(event.status)} ·{" "}
                  {formatPercent(toNumber(event.effective_commission_rate))}
                </span>
                <span className="font-mono tabular-nums">
                  {formatMoney(toNumber(event.net_payable))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManagePlans ? (
        <p className="border-t border-line pt-3 text-xs leading-5 text-ink-subtle">
          Plan rules and rates are configured under Admin → Commission settings. Historical
          commission events keep the rates they were calculated with.
        </p>
      ) : null}
    </div>
  );
}
