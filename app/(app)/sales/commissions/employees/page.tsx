import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state/empty-state";
import { LockIcon, UsersIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { listEmployeeCommissionSummaries } from "@/lib/commission/event-queries";
import { roleLabel } from "@/lib/permissions/roles";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Designers",
};

/**
 * The designer directory.
 *
 * A compact list of who participates in commission and what each of them is owed
 * right now. Configuration controls deliberately live on the designer's own
 * dashboard, so this page stays scannable and stays a directory rather than a pile of
 * inline forms.
 */
export default async function CommissionEmployeesPage() {
  const session = await requireSession();
  const canView = session.capabilities.includes("view:compensation-config");

  if (!canView) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Commission setup is restricted"
        description="Commission eligibility, plan assignment, draw status and balances are visible to accounting and administrators."
      />
    );
  }

  const designers = await listEmployeeCommissionSummaries();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Designers"
        description="Every sales designer with what they are projected to earn, what is waiting on approval or payment, and what they owe back through draw and rollover. Open a designer for their full commission dashboard."
      />

      {designers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="No portal users yet."
          description="Portal users are created under Admin → Users (or directly in Supabase Authentication). Once they exist, eligibility, plan assignment and draw status are managed here."
        />
      ) : (
        <ul className="space-y-4">
          {designers.map((designer) => (
            <li
              key={designer.profile.id}
              className="space-y-4 rounded-xl border border-line bg-surface p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/sales/commissions/employees/${designer.profile.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {designerProfileName(designer.profile)}
                    </Link>
                    <StatusBadge
                      label={designer.compensationEligible ? "Eligible" : "Not eligible"}
                      tone={designer.compensationEligible ? "positive" : "neutral"}
                    />
                    <StatusBadge
                      label={designer.onDraw ? "On draw" : "Standard rate"}
                      tone={designer.onDraw ? "info" : "neutral"}
                    />
                    {designer.profile.active ? null : (
                      <StatusBadge label="Deactivated" tone="warning" />
                    )}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {designer.planName ?? "No plan assigned"} ·{" "}
                    {roleLabel(designer.profile.role)}
                  </p>
                </div>

                <Link
                  href={`/sales/commissions/employees/${designer.profile.id}`}
                  className={buttonClassName({ size: "sm" })}
                >
                  View dashboard
                </Link>
              </div>

              <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                <Figure label="Projected" value={formatMoney(designer.projectedCommission)} strong />
                <Figure label="Pending approval" value={formatMoney(designer.pendingApproval)} />
                <Figure label="Ready to pay" value={formatMoney(designer.approvedUnpaid)} strong />
                <Figure label="Paid YTD" value={formatMoney(designer.paidYtd)} />
                <Figure label="Draw balance" value={formatMoney(designer.drawBalance)} />
                <Figure label="Rollover balance" value={formatMoney(designer.rolloverBalance)} />
                <Figure label="Draw status" value={designer.onDraw ? "On draw" : "Not on draw"} />
                <Figure
                  label="Plan effective"
                  value={
                    designer.assignmentEffectiveFrom
                      ? formatDate(designer.assignmentEffectiveFrom)
                      : "No assignment"
                  }
                />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function designerProfileName(profile: {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
}) {
  const combined = [profile.first_name, profile.last_name].filter(Boolean).join(" ");

  return combined || profile.display_name || profile.email || "Portal user";
}

function Figure({
  label,
  value,
  strong = false,
  text,
}: {
  label: string;
  value?: string;
  strong?: boolean;
  text?: ReactNode;
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
            : "font-mono text-sm tabular-nums text-ink"
        }
      >
        {text ?? value}
      </dd>
    </div>
  );
}
