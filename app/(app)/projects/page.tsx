import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { listVisibleProjects } from "@/lib/projects/queries";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Projects",
};

/**
 * Projects is the portal's shared project registry.
 *
 * Buildertrend remains the project-management system of record. This page stays
 * intentionally light: it gives the BOS a canonical list of projects that other
 * modules can reference without turning the portal into another PM system.
 */
export default async function ProjectsPage() {
  const session = await requireSession();
  const canManageJobs = session.capabilities.includes("manage:jobs");

  const { items, failed } = await listVisibleProjects({
    profileId: session.profile?.id ?? null,
    scope: "visible",
    limit: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="A simple list of Cabinet Genies projects used across the BOS. Project management stays in Buildertrend."
        actions={
          canManageJobs ? (
            <Link href={PROJECT_ROUTES.new} className={buttonClassName({ size: "sm" })}>
              Add project
            </Link>
          ) : null
        }
      />

      {failed ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="Projects could not be loaded"
          description="The project list could not be read just now. Reload the page to try again."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="No projects yet"
          description={
            canManageJobs
              ? "Add the first project to create the shared project record used across the BOS."
              : "No projects are visible to your account yet."
          }
          action={
            canManageJobs ? (
              <Link href={PROJECT_ROUTES.new} className={buttonClassName({ size: "sm" })}>
                Add project
              </Link>
            ) : null
          }
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>Project</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Sold</Th>
                <Th>
                  <span className="sr-only">Open project</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((project) => (
                <tr key={project.id}>
                  <Td>
                    <Link
                      href={project.href}
                      className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {project.name}
                    </Link>
                  </Td>
                  <Td>{formatText(project.customerName, "—")}</Td>
                  <Td>
                    <StatusBadge label={project.statusLabel} tone={project.statusTone} />
                  </Td>
                  <Td>{formatDate(project.soldDate)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <Link
                        href={project.href}
                        className={buttonClassName({ variant: "secondary", size: "sm" })}
                      >
                        Open
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
