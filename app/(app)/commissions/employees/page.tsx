import { EmployeeCommissionAssignmentForm, EmployeeCommissionSettingsForm } from "@/components/commission/employee-commission-forms";
import { EmptyState } from "@/components/empty-state/empty-state";
import { LockIcon, UsersIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import {
  listEmployeeCommissionOverview,
  listPlanSelectOptions,
} from "@/lib/commission/queries";
import { displayNameFor } from "@/lib/auth/identity";
import { roleLabel } from "@/lib/permissions/roles";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Employees",
};

export default async function CommissionEmployeesPage() {
  const session = await requireSession();
  const canView = session.capabilities.includes("view:commission-config");

  if (!canView) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Commission setup is restricted"
        description="Commission eligibility and plan assignments are visible to accounting and administrators."
      />
    );
  }

  const canManage = session.capabilities.includes("manage:employee-commission");
  const [employees, plans] = await Promise.all([
    listEmployeeCommissionOverview(),
    canManage ? listPlanSelectOptions() : Promise.resolve([]),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Employees"
        description="Who is commission eligible and which plan applies to them. Plan assignments are effective-dated, so changing a plan adds history instead of overwriting it."
      />

      {employees.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-5 w-5" />}
          title="No portal users yet."
          description="Portal users are created in Supabase Authentication. Once they exist, eligibility and plan assignments are managed here."
        />
      ) : (
        <TableWrap>
          <Table caption="Portal users with commission eligibility and current plan assignment">
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Profile</Th>
                <Th>Commission eligible</Th>
                <Th>Current plan</Th>
                <Th>Current version</Th>
                {canManage ? <Th>Setup</Th> : null}
              </tr>
            </thead>
            <tbody>
              {employees.map((row) => (
                <tr key={row.profile.id} className="align-top">
                  <Td>
                    <span className="font-medium text-ink">
                      {displayNameFor(row.profile, row.profile.email)}
                    </span>
                    <span className="block text-xs text-ink-subtle">
                      {formatText(row.profile.email)}
                    </span>
                  </Td>
                  <Td className="text-ink-muted">{roleLabel(row.profile.role)}</Td>
                  <Td>
                    <StatusBadge
                      label={row.profile.active ? "Active" : "Inactive"}
                      tone={row.profile.active ? "positive" : "neutral"}
                    />
                  </Td>
                  <Td>
                    <StatusBadge
                      label={row.settings?.commission_eligible ? "Eligible" : "Not eligible"}
                      tone={row.settings?.commission_eligible ? "positive" : "neutral"}
                    />
                  </Td>
                  <Td className="text-ink-muted">
                    {formatText(row.currentPlanName)}
                    {row.currentAssignment ? (
                      <span className="block text-xs text-ink-subtle">
                        from {formatDate(row.currentAssignment.effective_from)}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-ink-muted">{formatText(row.currentVersionName)}</Td>
                  {canManage ? (
                    <Td>
                      <details className="min-w-[22rem]">
                        <summary className="cursor-pointer text-sm font-medium text-ink">
                          Manage
                        </summary>
                        <div className="mt-3 space-y-5 rounded-lg border border-line bg-surface-muted p-3">
                          <EmployeeCommissionSettingsForm
                            profileId={row.profile.id}
                            commissionEligible={row.settings?.commission_eligible ?? false}
                            notes={row.settings?.notes ?? null}
                          />
                          <div className="border-t border-line pt-4">
                            <EmployeeCommissionAssignmentForm
                              profileId={row.profile.id}
                              plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
                              defaultEffectiveFrom={today}
                            />
                          </div>
                          {row.assignmentHistory.length > 0 ? (
                            <div className="border-t border-line pt-4">
                              <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                                Assignment history
                              </p>
                              <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                                {row.assignmentHistory.map((assignment) => (
                                  <li key={assignment.id}>
                                    {formatDate(assignment.effective_from)} →{" "}
                                    {assignment.effective_to
                                      ? formatDate(assignment.effective_to)
                                      : "open"}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
