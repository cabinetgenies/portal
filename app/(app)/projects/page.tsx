import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/dal";
import { listProjectSummaries } from "@/lib/projects/queries";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Projects",
};

/**
 * Projects — the shared parent entity.
 *
 * Sales and commissions are views over the same project record, so this list is
 * the shared one: identity, the sales financial position, the commission
 * projection and the final audit state, all read from the tables that already own
 * them. Rows are limited to the projects the viewer's role lets them read, which
 * is what Row Level Security already decided — this page adds no access of its
 * own, and takes none away.
 *
 * Execution detail belongs to Buildertrend: there is no schedule, task list,
 * calendar or daily log here, and none is faked.
 */
export default async function ProjectsPage() {
  const session = await requireSession();
  const canManageJobs = session.capabilities.includes("manage:jobs");
  const canViewFinancials = session.capabilities.includes("view:financials");

  const { items, failed, commission } = await listProjectSummaries({
    profileId: session.profile?.id ?? null,
    scope: "visible",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Every project this portal is responsible for, with the sales financial position, the commission projection and the audit state that go with it."
        actions={
          canManageJobs ? (
            <Link href={PROJECT_ROUTES.new} className={buttonClassName({ size: "sm" })}>
              New project
            </Link>
          ) : null
        }
      />

      <Panel
        id="projects-boundary"
        title="What a project is here"
        description="A project is the shared record: sales and commissions read the same one, so there is no separate sales project and commission project. Buildertrend stays the source of truth for execution, and commissions no longer own this identity."
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-muted">
          <li>
            Revenue, cost, gross profit and GP% are the stored figures commission is calculated
            against — not a second calculation.
          </li>
          <li>
            The commission projection and the final audit state come from the existing commission
            engine and audit workflow.
          </li>
          <li>
            {canViewFinancials
              ? "Scheduling, selections and site work remain in Buildertrend."
              : "Commission columns appear only for the roles whose security role allows financial visibility."}
          </li>
        </ul>
      </Panel>

      {failed ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="Projects could not be loaded"
          description="The project records could not be read just now. That is a failure, not an empty list — reload the page to try again."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="No projects yet"
          description={
            canManageJobs
              ? "No projects have been created yet. Create the first one to start building the record sales and commissions both read."
              : "No projects are visible to your account yet. If you expect to see projects here, ask an administrator to check your assignment."
          }
          action={
            canManageJobs ? (
              <Link href={PROJECT_ROUTES.new} className={buttonClassName({ size: "sm" })}>
                Create a project
              </Link>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-4">
          {items.map((project) => (
            <li key={project.id} className="space-y-4 rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={project.href}
                      className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {project.name}
                    </Link>
                    <StatusBadge label={project.statusLabel} tone={project.statusTone} />
                    {project.projectNumber ? (
                      <span className="font-mono text-xs text-ink-subtle">
                        {project.projectNumber}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {formatText(project.customerName, "No customer recorded")} · Sales designer:{" "}
                    {formatText(project.designerName, "Unassigned")} · Sold{" "}
                    {formatDate(project.soldDate)}
                  </p>
                </div>

                <Link
                  href={project.href}
                  className={buttonClassName({ variant: "secondary", size: "sm" })}
                >
                  Open project
                </Link>
              </div>

              <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <Figure label="Revenue" value={formatMoney(project.revenue)} />
                <Figure label="Cost" value={formatMoney(project.cost)} />
                <Figure label="Gross profit" value={formatMoney(project.grossProfit)} />
                <Figure label="GP %" value={formatPercent(project.gpPercent)} />
                <Figure
                  label="Projected commission"
                  value={
                    project.projectedCommission === null
                      ? "—"
                      : formatMoney(project.projectedCommission)
                  }
                  hint={
                    project.projectedCommission === null
                      ? "Not available for your role, or no plan version attached"
                      : null
                  }
                />
                <Figure
                  label="Final audit"
                  value={project.auditStateLabel ?? "—"}
                  hint={project.auditState === null ? "Restricted for your role" : null}
                />
              </dl>
            </li>
          ))}
        </ul>
      )}

      {commission === "unavailable" && items.length > 0 ? (
        <p className="text-xs leading-5 text-ink-subtle">
          The commission view model could not be read for your role, so the projected commission
          and audit columns are blank rather than estimated.
        </p>
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </dt>
      <dd className="font-mono text-sm tabular-nums text-ink">{value}</dd>
      {hint ? <p className="text-xs leading-5 text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
