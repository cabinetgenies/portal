import Link from "next/link";

import { CommissionRateCard } from "@/components/compensation/commission-rate-card";
import { PlanList } from "@/components/compensation/plan-list";
import { EmptyState } from "@/components/empty-state/empty-state";
import { LockIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { resolveApplicablePlanVersion } from "@/lib/compensation/plan-resolution";
import { listCompensationPlans, todayIso } from "@/lib/compensation/queries";
import {
  getCommissionSettings,
  listCommissionSettingsHistory,
} from "@/lib/commission/event-queries";
import { Panel } from "@/components/ui/panel";
import { formatDate, formatPercent } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Rules",
};

const PRODUCTION_PLAN_NAME = "Cabinet Genies Standard GP Commission";

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
  const [settings, history] = await Promise.all([
    getCommissionSettings(),
    listCommissionSettingsHistory(),
  ]);

  // The bands in force today, read from the plan version that governs new work.
  const productionPlan =
    plans.find((plan) => plan.name === PRODUCTION_PLAN_NAME) ?? null;
  const currentVersion = productionPlan
    ? resolveApplicablePlanVersion(
        productionPlan.versions.map((version) => ({
          id: version.id,
          commissionPlanId: version.compensation_plan_id,
          versionName: version.version_name,
          effectiveFrom: version.effective_from,
          effectiveTo: version.effective_to,
          active: version.active,
        })),
        today,
      )
    : null;
  const currentVersionTiers = currentVersion
    ? productionPlan?.versions.find((version) => version.id === currentVersion.id)?.tiers ?? []
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Rules"
        description="The commission bands in force today, then the plans, effective-dated versions and GP tiers that payments are calculated from. Commission is a percentage of commissionable gross profit; sales manager compensation is not implemented."
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

      {productionPlan && currentVersion ? (
        <CommissionRateCard
          versionName={currentVersion.versionName}
          effectiveFrom={currentVersion.effectiveFrom}
          effectiveTo={currentVersion.effectiveTo}
          tiers={currentVersionTiers}
          canEdit={canEdit}
          editHref="/admin/compensation-plans"
        />
      ) : null}

      <PlanList plans={plans} canEdit={false} today={today} />

      <Panel
        id="rule-inputs"
        title="Rule inputs"
        description="Deposit payout percentage, draw rate reduction and whether the draw system is enabled. Every commission event snapshots the values it used."
        actions={
          canEdit ? (
            <Link
              href="/admin/commission-settings"
              className={buttonClassName({ size: "sm", variant: "secondary" })}
            >
              Edit settings
            </Link>
          ) : null
        }
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
              Deposit payout
            </dt>
            <dd className="text-sm text-ink">
              {formatPercent(settings?.depositPayoutPercent ?? 0.5, 0)} of projected
              commission
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
              Draw rate reduction
            </dt>
            <dd className="text-sm text-ink">
              {((settings?.drawRateReduction ?? 0.05) * 100).toFixed(2)} percentage points
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
              Draw system
            </dt>
            <dd className="text-sm text-ink">
              {settings?.drawEnabled ?? true ? "Enabled" : "Disabled"}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-xs font-medium tracking-[0.12em] text-ink-subtle uppercase">
              Effective
            </dt>
            <dd className="text-sm text-ink">{formatDate(settings?.effectiveFrom ?? null)}</dd>
          </div>
        </dl>

        {history.length > 1 ? (
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs text-ink-muted">
            {history.slice(1).map((row) => (
              <li key={row.id}>
                Effective {formatDate(row.effectiveFrom)} · deposit{" "}
                {formatPercent(row.depositPayoutPercent, 0)} · draw reduction{" "}
                {(row.drawRateReduction * 100).toFixed(2)} points ·{" "}
                {row.drawEnabled ? "draw enabled" : "draw disabled"}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </div>
  );
}
