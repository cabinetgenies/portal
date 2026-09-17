import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { Table, TableWrap, Td, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { JOB_STATUSES, JOB_STATUS_LABELS } from "@/lib/commission/types";
import { listProjectRegistry } from "@/lib/projects/queries";
import { PROJECT_ROUTES } from "@/lib/routes";
import { formatDate, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Projects",
};

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
  ["newest", "Newest added"],
  ["oldest", "Oldest added"],
  ["name", "Project name"],
  ["customer", "Customer"],
] as const;

type SortKey = (typeof SORT_OPTIONS)[number][0];

type ProjectsSearchParams = {
  q?: string;
  status?: string;
  designer?: string;
  sort?: string;
  page?: string;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<ProjectsSearchParams>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  const canManageJobs = session.capabilities.includes("manage:jobs");

  const { items, failed } = await listProjectRegistry({
    profileId: session.profile?.id ?? null,
    scope: "visible",
  });

  const query = (params.q ?? "").trim().toLowerCase();
  const status = JOB_STATUSES.includes(params.status as (typeof JOB_STATUSES)[number])
    ? params.status ?? "all"
    : "all";
  const designer = params.designer ?? "all";
  const sort: SortKey = SORT_OPTIONS.some(([key]) => key === params.sort)
    ? (params.sort as SortKey)
    : "newest";

  const designerOptions = Array.from(
    new Map(
      items
        .filter((project) => project.designerId && project.designerName)
        .map((project) => [project.designerId as string, project.designerName as string]),
    ),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const statusCounts = new Map<string, number>();
  for (const project of items) {
    statusCounts.set(project.status, (statusCounts.get(project.status) ?? 0) + 1);
  }

  const filtered = items
    .filter((project) => {
      if (status !== "all" && project.status !== status) return false;
      if (designer !== "all" && project.designerId !== designer) return false;
      if (!query) return true;

      return [
        project.name,
        project.projectNumber,
        project.customerName,
        project.designerName,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    })
    .sort((a, b) => {
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "customer") {
        return (a.customerName ?? "").localeCompare(b.customerName ?? "");
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="The shared Cabinet Genies project registry. Project management stays in Buildertrend."
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
        <>
          <section className="space-y-4 rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {filtered.length} {filtered.length === 1 ? "project" : "projects"}
                </p>
                <p className="text-xs text-ink-muted">
                  {items.length} total visible to your account
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                {JOB_STATUSES.filter((key) => (statusCounts.get(key) ?? 0) > 0).map((key) => (
                  <span key={key} className="rounded-full border border-line px-2.5 py-1">
                    {JOB_STATUS_LABELS[key]} {statusCounts.get(key)}
                  </span>
                ))}
              </div>
            </div>

            <form method="get" className="grid gap-3 lg:grid-cols-[minmax(16rem,2fr)_1fr_1fr_1fr_auto]">
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-muted">Search</span>
                <input
                  type="search"
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Project, customer, number, or designer"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-line-strong focus:ring-2 focus:ring-accent/20"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-muted">Status</span>
                <select
                  name="status"
                  defaultValue={status}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-line-strong focus:ring-2 focus:ring-accent/20"
                >
                  <option value="all">All statuses</option>
                  {JOB_STATUSES.map((key) => (
                    <option key={key} value={key}>
                      {JOB_STATUS_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-muted">Designer</span>
                <select
                  name="designer"
                  defaultValue={designer}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-line-strong focus:ring-2 focus:ring-accent/20"
                >
                  <option value="all">All designers</option>
                  {designerOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-muted">Sort</span>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-line-strong focus:ring-2 focus:ring-accent/20"
                >
                  {SORT_OPTIONS.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button type="submit" className={buttonClassName({ size: "sm" })}>
                  Apply
                </button>
                <Link href={PROJECT_ROUTES.overview} className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Clear
                </Link>
              </div>
            </form>
          </section>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ProjectsIcon className="h-5 w-5" />}
              title="No matching projects"
              description="Try a different search or clear one of the filters."
              action={
                <Link href={PROJECT_ROUTES.overview} className={buttonClassName({ variant: "secondary", size: "sm" })}>
                  Clear filters
                </Link>
              }
            />
          ) : (
            <>
              <TableWrap>
                <Table caption="Projects registry">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <Th>Project</Th>
                      <Th>Customer</Th>
                      <Th>Project #</Th>
                      <Th>Status</Th>
                      <Th>Designer</Th>
                      <Th>Sold</Th>
                      <Th>
                        <span className="sr-only">Open project</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((project) => (
                      <tr key={project.id} className="transition-colors hover:bg-surface-muted/60">
                        <Td>
                          <Link
                            href={project.href}
                            className="font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          >
                            {project.name}
                          </Link>
                        </Td>
                        <Td>{formatText(project.customerName, "—")}</Td>
                        <Td className="font-mono text-xs text-ink-muted">
                          {formatText(project.projectNumber, "—")}
                        </Td>
                        <Td>
                          <StatusBadge label={project.statusLabel} tone={project.statusTone} />
                        </Td>
                        <Td>{formatText(project.designerName, "Unassigned")}</Td>
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

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
                <p>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                {pageCount > 1 ? (
                  <div className="flex items-center gap-2">
                    {page > 1 ? (
                      <Link
                        href={projectListHref({ ...params, page: String(page - 1) })}
                        className={buttonClassName({ variant: "secondary", size: "sm" })}
                      >
                        Previous
                      </Link>
                    ) : null}
                    <span className="px-2 text-xs">
                      Page {page} of {pageCount}
                    </span>
                    {page < pageCount ? (
                      <Link
                        href={projectListHref({ ...params, page: String(page + 1) })}
                        className={buttonClassName({ variant: "secondary", size: "sm" })}
                      >
                        Next
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function projectListHref(params: ProjectsSearchParams) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all" && !(key === "page" && value === "1")) {
      query.set(key, value);
    }
  }

  const suffix = query.toString();
  return suffix ? `${PROJECT_ROUTES.overview}?${suffix}` : PROJECT_ROUTES.overview;
}
