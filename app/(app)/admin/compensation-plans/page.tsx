import { CompensationPlanCreateForm } from "@/components/compensation/plan-forms";
import { PlanList } from "@/components/compensation/plan-list";
import { EmptyState } from "@/components/empty-state/empty-state";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { listCompensationPlans, todayIso } from "@/lib/compensation/queries";

export const metadata = {
  title: "Compensation plans",
};

export default async function CompensationPlansPage() {
  const session = await requireCapability("manage:compensation-config");

  if (!session.isAllowed) {
    return (
      <EmptyState
        title="Compensation plans are managed by administrators"
        description="Your role can view compensation configuration but not change it."
      />
    );
  }

  const plans = await listCompensationPlans();
  const today = todayIso();

  return (
    <div className="space-y-6">
      <Panel
        id="plan-create"
        title="Add a compensation plan"
        description="A plan is a named, versioned set of rules for one participant. Editing a plan means adding a new version — existing versions are never rewritten, so a job that was sold under one keeps it."
      >
        <CompensationPlanCreateForm />
      </Panel>

      <Panel
        id="plan-list"
        title="Plans, versions and tiers"
        description="Versions are effective-dated. Two active versions of the same plan may not cover the same day, which is what makes 'the version effective on the sold date' unambiguous. Sales manager plans are reserved: they can be described here, but no manager bonus is calculated in this phase."
      >
        <PlanList plans={plans} canEdit today={today} />
      </Panel>
    </div>
  );
}
