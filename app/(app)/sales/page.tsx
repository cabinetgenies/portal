import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowRightIcon, CommissionsIcon, ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { PROJECT_ROUTES, SALES_ROUTES } from "@/lib/routes";

export const metadata = {
  title: "Sales",
};

export default function SalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Sales"
        description="The sales side of the portal. Commission tracking is built; a sales pipeline is not, and nothing is simulated here."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SalesCard
          href={PROJECT_ROUTES.overview}
          title="Projects"
          description="The shared project record: identity, sales financials, commission and the final audit — the same projects commission is calculated against."
          icon={<ProjectsIcon className="h-4 w-4" />}
        />
        <SalesCard
          href={SALES_ROUTES.commissions}
          title="Commissions"
          description="The commission sub-app: designer dashboards, payments, plans & rules and reports."
          icon={<CommissionsIcon className="h-4 w-4" />}
        />
      </div>
    </div>
  );
}

function SalesCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="space-y-1">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted">
          {icon}
        </span>
        <span className="block pt-3 text-sm font-medium text-ink">{title}</span>
        <span className="block text-sm leading-6 text-ink-muted">{description}</span>
      </span>
      <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
