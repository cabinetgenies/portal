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
import { PROJECT_ROUTES } from "@/lib/routes";

export const metadata = {
  title: "New project",
};

/**
 * The canonical project creation route.
 *
 * Creating a project is creating the job record — one form, one write path. Sales
 * and commissions both link here rather than each growing a creation form of its
 * own, which is what stops the two from drifting into two different ideas of what
 * a project is.
 */
export default async function NewProjectPage() {
  const session = await requireCapability("manage:jobs");

  if (!session.isAllowed) {
    return (
      <EmptyState
        title="Creating projects is restricted"
        description="Projects are created by administrators. Ask an administrator if you need a project added."
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
        eyebrow="Projects"
        title="New project"
        description="One record per project, sized for commission and financial audit: identity, the plan version that governs it, the revenue and cost structure, and the milestone dates that make a commission eligible. Buildertrend keeps the execution detail."
        actions={
          <Link
            href={PROJECT_ROUTES.overview}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Back to projects
          </Link>
        }
      />

      <Panel
        id="job-entry"
        title="Project details"
        description="Revenue and cost entered here are stored on the project record, and the derived totals are written by the shared calculation. No demo or placeholder projects are created."
      >
        <NewJobForm options={options} />
      </Panel>
    </div>
  );
}
