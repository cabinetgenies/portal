import Link from "next/link";

import {
  UpdatePortalUserForm,
  type ManagerOption,
} from "@/components/admin/user-forms";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { drawStatusLabel, type UserDirectoryRow } from "@/lib/admin/user-directory";
import { formatDate, formatText } from "@/lib/utils/format";

/**
 * The user directory itself. Rows come from public.profiles joined with
 * compensation eligibility, the plan assignment in force today and draw
 * enrollment — the portal's own tables, not a second user store.
 */
export function UserDirectoryTable({
  users,
  managers,
  currentUserId,
}: {
  users: UserDirectoryRow[];
  managers: ManagerOption[];
  currentUserId: string;
}) {
  return (
    <TableWrap>
      <Table caption="Portal users with role, reporting line, status, compensation eligibility and draw status">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Department</Th>
            <Th>Manager</Th>
            <Th>Status</Th>
            <Th>Compensation eligibility</Th>
            <Th>Current compensation plan</Th>
            <Th>Draw status</Th>
            <Th>Setup</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.profileId} className="align-top">
              <Td>
                <span className="font-medium text-ink">{user.name}</span>
                {user.profileId === currentUserId ? (
                  <span className="ml-2 text-xs text-ink-subtle">(you)</span>
                ) : null}
                {user.displayName ? (
                  <span className="block text-xs text-ink-subtle">
                    Display name: {user.displayName}
                  </span>
                ) : null}
              </Td>
              <Td className="text-ink-muted">{formatText(user.email)}</Td>
              <Td className="text-ink-muted">{user.roleLabel}</Td>
              <Td className="text-ink-muted">{formatText(user.department)}</Td>
              <Td className="text-ink-muted">{formatText(user.managerName)}</Td>
              <Td>
                <StatusBadge
                  label={user.statusLabel}
                  tone={user.active ? "positive" : "warning"}
                />
              </Td>
              <Td>
                <StatusBadge
                  label={user.compensationEligible ? "Eligible" : "Not eligible"}
                  tone={user.compensationEligible ? "positive" : "neutral"}
                />
              </Td>
              <Td className="text-ink-muted">
                {user.planName ?? "No plan assigned"}
                {user.assignmentEffectiveFrom ? (
                  <span className="block text-xs text-ink-subtle">
                    since {formatDate(user.assignmentEffectiveFrom)}
                  </span>
                ) : null}
              </Td>
              <Td>
                <StatusBadge
                  label={drawStatusLabel(user)}
                  tone={user.onDraw ? "info" : "neutral"}
                />
                {user.openDrawPeriodFrom ? (
                  <span className="block text-xs text-ink-subtle">
                    since {formatDate(user.openDrawPeriodFrom)}
                  </span>
                ) : null}
              </Td>
              <Td>
                <details className="min-w-[24rem]">
                  <summary className="cursor-pointer text-sm font-medium text-ink">
                    Manage
                  </summary>
                  <div className="mt-3 space-y-4 rounded-lg border border-line bg-surface-muted p-3">
                    <UpdatePortalUserForm user={user} managers={managers} />
                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                      <Link
                        href="/commissions/employees"
                        className={buttonClassName({ size: "sm", variant: "secondary" })}
                      >
                        Compensation &amp; draw setup
                      </Link>
                      <span className="text-xs leading-5 text-ink-subtle">
                        Eligibility, plan assignment, effective dates and draw periods are
                        managed there, next to the balances they affect.
                      </span>
                    </div>
                  </div>
                </details>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}
