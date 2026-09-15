import Link from "next/link";

import { NewJobForm } from "@/components/commission/new-job-form";
import { EmptyState } from "@/components/empty-state/empty-state";
import { PageHeader } from "@/components/page-header/page-header";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { requireCapability } from "@/lib/auth/dal";
import { todayIso } from "@/lib/compensation/queries";
import {
  jobCostRateDefaults,
  loadCommissionWorkspace,
  settingsSnapshot,
} from "@/lib/commission/event-queries";
import { buildJobEntryOptions } from "@/lib/commission/job-entry";

export const metadata = {
  title: "New job",
};

export default async function NewJobPage() {
  const session = await requireCapability("manage:jobs");

  if (!session.isAllowed) {
    return (
      <EmptyState
        title="Creating jobs is restricted"
        description="Jobs are created by administrators. Ask an administrator if you need a job added."
      />
    );
  }

  const workspace = await loadCommissionWorkspace();

  // One pass over the compensation workspace: the designers with the plan
  // assignment in force today, the sales designer plan catalogue with its tiers,
  // and the rule inputs the deposit and draw figures come from.
  const options = buildJobEntryOptions({
    profiles: workspace.profiles,
    compensationSettings: workspace.compensationSettings,
    assignments: workspace.assignments,
    plans: workspace.plans,
    planVersions: workspace.planVersions,
    planTiers: workspace.planTiers,
    drawPeriods: workspace.drawPeriods,
    settings: settingsSnapshot(workspace.settings),
    costRates: jobCostRateDefaults(workspace.settings),
    today: todayIso(),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="New job"
        description="One record per job, sized for commission and financial audit: identity, the plan version that governs it, the revenue and cost structure, and the milestone dates that make a commission eligible."
        actions={
          <Link
            href="/sales/commissions/jobs"
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Back to jobs
          </Link>
        }
      />

      <Panel
        id="job-entry"
        title="Job details"
        description="Revenue and cost entered here are stored on the job, and the derived totals are written by the shared calculation. No demo or placeholder jobs are created."
      >
        <NewJobForm options={options} />
      </Panel>
    </div>
  );
}
