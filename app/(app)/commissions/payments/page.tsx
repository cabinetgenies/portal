import Link from "next/link";

import { CommissionEventWorkflowActions } from "@/components/commission/commission-actions";
import { EmptyState } from "@/components/empty-state/empty-state";
import { CommissionsIcon, LockIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { loadCommissionWorkspace } from "@/lib/commission/event-queries";
import { toNumber } from "@/lib/commission/financials";
import {
  commissionEventStatusLabel,
  commissionEventStatusTone,
  commissionEventTypeLabel,
} from "@/lib/commission/types";
import type { CommissionEventRow } from "@/lib/supabase/database.types";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Payments",
};

export default async function CommissionPaymentsPage() {
  const session = await requireSession();
  const canView = session.capabilities.includes("view:financials");

  if (!canView) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Commission payments are restricted"
        description="Accounting and administrators manage the commission approval and payment workflow."
      />
    );
  }

  const workspace = await loadCommissionWorkspace();
  const profilesById = new Map(workspace.profiles.map((profile) => [profile.id, profile]));
  const jobsById = new Map(workspace.jobs.map((job) => [job.id, job]));

  const events = workspace.events.map((event) => {
    const profile = profilesById.get(event.profile_id);
    const designerName = profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        profile.display_name ||
        profile.email
      : null;

    return {
      event,
      jobName: jobsById.get(event.job_id)?.job_name ?? null,
      designerName,
    };
  });

  const pending = events.filter((entry) => entry.event.status === "pending_approval");
  const approved = events.filter((entry) => entry.event.status === "approved");
  const settled = events.filter(
    (entry) => entry.event.status === "paid" || entry.event.status === "voided",
  );

  const canSubmit = session.capabilities.includes("submit:commission");
  const canApprove = session.capabilities.includes("approve:commission");
  const canPay = session.capabilities.includes("pay:commission");
  const canVoid = session.capabilities.includes("void:commission");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Commissions"
        title="Payments"
        description="Approve calculated commission events, mark them paid, or void an unpaid event with a reason. Paid history is never deleted — corrections are adjustments."
      />

      <EventQueue
        id="pending-approval"
        title="Pending approval"
        description="Calculated events waiting on an approver. Approving applies the rollover and draw offsets and posts the ledger entries."
        emptyLabel="Nothing is waiting for approval."
        entries={pending}
        canSubmit={canSubmit}
        canApprove={canApprove}
        canPay={canPay}
        canVoid={canVoid}
      />

      <EventQueue
        id="approved"
        title="Approved / awaiting payment"
        description="Approved events whose offsets are already on the ledgers."
        emptyLabel="Nothing is approved and awaiting payment."
        entries={approved}
        canSubmit={canSubmit}
        canApprove={canApprove}
        canPay={canPay}
        canVoid={canVoid}
      />

      <EventQueue
        id="settled"
        title="Paid and voided history"
        description="Kept permanently for audit. Paid events cannot be changed or deleted."
        emptyLabel="No commission has been paid yet."
        entries={settled}
        canSubmit={canSubmit}
        canApprove={canApprove}
        canPay={canPay}
        canVoid={canVoid}
      />
    </div>
  );
}

type EventQueueEntry = {
  event: CommissionEventRow;
  jobName: string | null;
  designerName: string | null;
};

function EventQueue({
  id,
  title,
  description,
  emptyLabel,
  entries,
  canSubmit,
  canApprove,
  canPay,
  canVoid,
}: {
  id: string;
  title: string;
  description: string;
  emptyLabel: string;
  entries: EventQueueEntry[];
  canSubmit: boolean;
  canApprove: boolean;
  canPay: boolean;
  canVoid: boolean;
}) {
  return (
    <Panel id={id} title={title} description={description}>
      {entries.length === 0 ? (
        <EmptyState
          icon={<CommissionsIcon className="h-5 w-5" />}
          title={emptyLabel}
          description="Commission events move through calculation, approval and payment on the job they belong to."
        />
      ) : (
        <TableWrap>
          <Table caption={title}>
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Sales designer</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th className="text-right">Rate</Th>
                <Th className="text-right">Gross</Th>
                <Th className="text-right">Net payable</Th>
                <Th>Workflow</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.event.id}>
                  <Td>
                    <Link
                      href={`/commissions/jobs/${entry.event.job_id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {entry.jobName ?? "Job"}
                    </Link>
                    <span className="block text-xs text-ink-subtle">
                      {formatDateTime(entry.event.created_at)}
                    </span>
                  </Td>
                  <Td className="text-ink-muted">{entry.designerName ?? "—"}</Td>
                  <Td>{commissionEventTypeLabel(entry.event.event_type)}</Td>
                  <Td>
                    <StatusBadge
                      label={commissionEventStatusLabel(entry.event.status)}
                      tone={commissionEventStatusTone(entry.event.status)}
                    />
                    {entry.event.void_reason ? (
                      <span className="mt-1 block max-w-56 text-xs text-ink-subtle">
                        {entry.event.void_reason}
                      </span>
                    ) : null}
                  </Td>
                  <TdNumeric>{formatPercent(toNumber(entry.event.effective_commission_rate))}</TdNumeric>
                  <TdNumeric>{formatMoney(toNumber(entry.event.gross_commission))}</TdNumeric>
                  <TdNumeric>{formatMoney(toNumber(entry.event.net_payable))}</TdNumeric>
                  <Td>
                    <CommissionEventWorkflowActions
                      eventId={entry.event.id}
                      status={entry.event.status}
                      canSubmit={canSubmit}
                      canApprove={canApprove}
                      canPay={canPay}
                      canVoid={canVoid}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Panel>
  );
}
