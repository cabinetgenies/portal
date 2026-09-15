import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { listVisibleProjects } from "@/lib/projects/queries";
import { formatDate } from "@/lib/utils/format";

export const metadata = {
  title: "Projects",
};

/**
 * Projects.
 *
 * The portal's own view of the projects it is responsible for: the `jobs` records,
 * under the job policies that already exist, so nobody sees a project they could
 * not already see elsewhere in the portal.
 *
 * Buildertrend stays the execution system of record for delivery. This module does
 * not rebuild it or simulate it, and the boundary is stated on the page so nobody
 * has to wonder which system is authoritative.
 */
export default async function ProjectsPage() {
  const session = await requireSession();
  const canViewAllJobs = session.capabilities.includes("view:jobs-all");
  const { items, failed } = await listVisibleProjects({
    profileId: session.profile?.id ?? null,
    canViewAllJobs,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description={
          canViewAllJobs
            ? "Every project record in the portal, with its current status."
            : "The project records assigned to you, with their current status."
        }
      />

      <Panel
        id="projects-boundary"
        title="What this module is, and what it is not"
        description="Buildertrend remains the source of truth for project execution. This is the portal&apos;s own project record, used for commission and operational context — not a replacement for Buildertrend."
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink-muted">
          <li>The list below is real: it reads the portal&apos;s job records.</li>
          <li>
            Scheduling, selections, client change orders and job-site execution stay in
            Buildertrend.
          </li>
          <li>
            Commission detail for a project lives under{" "}
            <Link
              href="/sales/commissions/jobs"
              className="underline underline-offset-4 hover:text-ink"
            >
              Commissions → Commission Jobs
            </Link>
            .
          </li>
        </ul>
      </Panel>

      <Panel
        id="project-list"
        title="Project records"
        description={`${items.length} project${items.length === 1 ? "" : "s"} visible to your account.`}
      >
        {failed ? (
          <EmptyState
            icon={<ProjectsIcon className="h-5 w-5" />}
            title="Projects could not be loaded"
            description="The project records could not be read just now. That is a failure, not an empty list — reload the page to try again."
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ProjectsIcon className="h-5 w-5" />}
            title="No project records yet"
            description={
              canViewAllJobs
                ? "No projects have been created in the portal yet. A project record is created from a commission job."
                : "No project records are assigned to you yet. If you expect to see your projects here, ask an administrator to check your assignment."
            }
          />
        ) : (
          <TableWrap>
            <Table caption="Project records">
              <thead>
                <tr>
                  <Th>Project</Th>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th>Sold</Th>
                  <Th>Commission detail</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((project) => (
                  <tr key={project.id}>
                    <Td className="font-medium">{project.name}</Td>
                    <Td className="text-ink-muted">{project.customerName ?? "—"}</Td>
                    <Td>
                      <StatusBadge label={project.statusLabel} tone={project.statusTone} />
                    </Td>
                    <Td className="text-ink-muted">{formatDate(project.soldDate)}</Td>
                    <Td>
                      <Link
                        href={project.href}
                        className="text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
                      >
                        Open job record
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
