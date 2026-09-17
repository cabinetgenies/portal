import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ProjectTabs } from "@/components/projects/project-tabs";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
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
  const project = await getProjectShell(id);

  if (!project) notFound();

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.14em] text-ink-subtle uppercase">
                {project.projectNumber ? `Project ${project.projectNumber}` : "Project"}
              </span>
              <StatusBadge label={project.statusLabel} tone={project.statusTone} />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
                {project.name}
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                {formatText(project.customerName, "No customer recorded")}
              </p>
            </div>

            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div className="flex gap-1.5">
                <dt className="text-ink-subtle">Designer</dt>
                <dd className="font-medium text-ink">{formatText(project.designerName, "Unassigned")}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-subtle">Sold</dt>
                <dd className="font-medium text-ink">{formatDate(project.soldDate)}</dd>
              </div>
            </dl>
          </div>

          <Link
            href={PROJECT_ROUTES.overview}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Back to projects
          </Link>
        </div>

        <div className="border-t border-line bg-surface-muted/40 p-2 sm:px-4">
          <ProjectTabs projectId={id} />
        </div>
      </section>

      {children}
    </div>
  );
}
