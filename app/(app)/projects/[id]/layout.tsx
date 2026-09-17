import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ProjectTabs } from "@/components/projects/project-tabs";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/dal";
import { getProjectShell } from "@/lib/projects/shell";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatText } from "@/lib/utils/format";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, session] = await Promise.all([getProjectShell(id), requireSession()]);

  if (!project) notFound();
  const canManageJobs = session.capabilities.includes("manage:jobs");

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-ink-subtle">
              Projects <span className="px-1.5">/</span> {project.name}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
                {project.name}
              </h1>
              <StatusBadge label={project.statusLabel} tone={project.statusTone} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-muted">
              {project.projectNumber ? <span>Project #{project.projectNumber}</span> : null}
              <span>{formatText(project.customerName, "No customer recorded")}</span>
              <span>Designer: {formatText(project.designerName, "Unassigned")}</span>
              <span>Sold: {formatDate(project.soldDate)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageJobs ? (
              <Link
                href={`${PROJECT_ROUTES.project(id)}?edit=1`}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                Edit project
              </Link>
            ) : null}
            <Link
              href={PROJECT_ROUTES.overview}
              className={buttonClassName({ variant: "secondary", size: "sm" })}
            >
              Back to projects
            </Link>
          </div>
        </div>

        <div className="mt-5 border-t border-line">
          <ProjectTabs projectId={id} />
        </div>
      </section>

      {children}
    </div>
  );
}
