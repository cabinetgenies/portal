import Link from "next/link";

import { ArrowRightIcon, CommissionsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { SALES_ROUTES } from "@/lib/routes";

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

      <Link
        href={SALES_ROUTES.commissions}
        className="group flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="space-y-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted">
            <CommissionsIcon className="h-4 w-4" />
          </span>
          <span className="block pt-3 text-sm font-medium text-ink">Commissions</span>
          <span className="block text-sm leading-6 text-ink-muted">
            Commission jobs, designer dashboards, payments, plans &amp; rules and reports.
          </span>
        </span>
        <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
