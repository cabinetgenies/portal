import Link from "next/link";

import { PlanList } from "@/components/commission/plan-list";
import { EmptyState } from "@/components/empty-state/empty-state";
import { LockIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { listCommissionPlans } from "@/lib/commission/queries";

export const metadata = {
  title: "Commission Rules",
};

export default async function CommissionRulesPage() {
  const session = await requireSession();
  const canView = session.capabilities.includes("view:commission-config");
  const canEdit = session.capabilities.includes("manage:commission-config");

  if (!canView) {
    return (
      <EmptyState
        icon={<LockIcon className="h-5 w-5" />}
        title="Commission rules are restricted"
        description="Plans, effective-dated versions and GP tiers are visible to accounting and administrators."
      />
    );
  }

  const plans = await listCommissionPlans();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Rules"
        description="The plans, effective-dated versions and GP tiers that commissions will be calculated from. Payout math itself is not implemented yet."
        actions={
          canEdit ? (
            <Link
              href="/admin/commission-plans"
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
