import { CommissionPlanCreateForm } from "@/components/commission/plan-forms";
import { PlanList } from "@/components/commission/plan-list";
import { EmptyState } from "@/components/empty-state/empty-state";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { listCommissionPlans } from "@/lib/commission/queries";

export const metadata = {
  title: "Commission plans",
};

export default async function CommissionPlansPage() {
  const session = await requireCapability("manage:commission-config");

  if (!session.isAllowed) {
    return (
      <EmptyState
        title="Commission plans are managed by administrators"
        description="Your role can view commission configuration but not change it."
      />
    );
  }

  const plans = await listCommissionPlans();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Panel
        id="plan-create"
        title="Add a commission plan"
        description="A plan is a named, versioned set of rules. Editing a plan means adding a new version — existing versions are never rewritten, so a job sold under one keeps it."
      >
        <CommissionPlanCreateForm />
      </Panel>

      <Panel
        id="plan-list"
        title="Plans, versions and tiers"
        description="Versions are effective-dated. Two active versions of the same plan may not cover the same day, which is what makes 'the version effective on the sold date' unambiguous."
      >
        <PlanList plans={plans} canEdit today={today} />
      </Panel>
    </div>
  );
}
