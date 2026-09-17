import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ProjectTabs } from "@/components/projects/project-tabs";
import { PageHeader } from "@/components/page-header/page-header";
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
    <div className="space-y-6">
      <PageHeader
        eyebrow={project.projectNumber ? `Project ${project.projectNumber}` : "Project"}
        title={project.name}
        description={formatText(project.customerName, "No customer recorded")}
        actions={
          <Link
            href={PROJECT_ROUTES.overview}
            className={buttonClassName({ variant: "secondary", size: "sm" })}
          >
            Back to projects
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={project.statusLabel} tone={project.statusTone} />
        <span className="text-xs text-ink-muted">
          Sales designer: {formatText(project.designerName, "Unassigned")}
        </span>
        <span className="text-xs text-ink-muted">Sold: {formatDate(project.soldDate)}</span>
      </div>

      <ProjectTabs projectId={id} />
      {children}
    </div>
  );
}
