import type { ReactNode } from "react";

import { CommissionsNav } from "@/components/commissions/commissions-nav";
import { PageHeader } from "@/components/page-header/page-header";

export default function CommissionsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Commissions"
        description="The commission center: jobs, designers, payments, plans and rules, and reporting."
      />
      <CommissionsNav />
      {children}
    </div>
  );
}
