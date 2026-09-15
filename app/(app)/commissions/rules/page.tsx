import Link from "next/link";

import { PlanList } from "@/components/compensation/plan-list";
import { EmptyState } from "@/components/empty-state/empty-state";
import { LockIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { listCompensationPlans, todayIso } from "@/lib/compensation/queries";

export const metadata = {
  title: "Commission Rules",
};

export default async function CommissionRulesPage() {
  const session = await requireSession();
  const canView = session.capabilities.includes("view:compensation-config");
  const canEdit = session.capabilities.includes("manage:compensation-config");

  if (!canView) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Compensation rules are restricted"
        description="Compensation plans, effective-dated versions and GP tiers are visible to accounting and administrators."
      />
    );
  }

  const plans = await listCompensationPlans();
  const today = todayIso();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Rules"
        description="The compensation plans, effective-dated versions and GP tiers that payments will be calculated from. Payout math itself is not implemented yet, for sales designers or sales managers."
        actions={
          canEdit ? (
            <Link
              href="/admin/compensation-plans"
              className={buttonClassName({ size: "sm" })}
            >
              Edit plans
            </Link>
          ) : null
        }
      />

      <PlanList plans={plans} canEdit={false} today={today} />
    </div>
  );
}
