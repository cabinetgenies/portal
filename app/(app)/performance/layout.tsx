import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state/empty-state";
import { PerformanceIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { PerformanceNav } from "@/components/performance/performance-nav";
import { requireSession } from "@/lib/auth/dal";

const PERFORMANCE_CAPABILITIES = [
  "view:performance-own",
  "view:performance-team",
  "view:performance-all",
  "manage:performance",
] as const;

export const metadata = {
  title: "Performance & Leadership",
};

export default async function PerformanceLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const allowed = PERFORMANCE_CAPABILITIES.some((capability) =>
    session.capabilities.includes(capability),
  );

  if (!allowed) {
    return (
      <EmptyState
        icon={<PerformanceIcon className="h-5 w-5" />}
        title="Performance & Leadership is restricted"
        description="Your portal role does not include performance data. A manager can see their direct reports, and leadership can see their department or company."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Performance & Leadership"
        title="Performance & Leadership"
        description="Scorecards, quarterly priorities, meetings, issues, actions and reviews — clean and operational, without an EOS clone."
      />
      <PerformanceNav />
      {children}
    </div>
  );
}

