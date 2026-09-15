import Link from "next/link";

import { EmptyState } from "@/components/empty-state/empty-state";
import { ProjectsIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header/page-header";
import { buttonClassName } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableWrap, Td, TdNumeric, Th } from "@/components/ui/table";
import { requireSession } from "@/lib/auth/dal";
import { listJobs } from "@/lib/commission/queries";
import { jobStatusLabel, jobStatusTone } from "@/lib/commission/types";
import { formatMoney, formatPercent, formatText } from "@/lib/utils/format";

export const metadata = {
  title: "Commission Jobs",
};

export default async function CommissionJobsPage() {
  const session = await requireSession();
  const canManageJobs = session.capabilities.includes("manage:jobs");
  const jobs = await listJobs();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commissions"
        title="Jobs"
        description="Every job with the financial structure commissions will be calculated from. Rows are limited to the jobs your role can see."
        actions={
          canManageJobs ? (
            <Link href="/commissions/jobs/new" className={buttonClassName({ size: "sm" })}>
              New job
            </Link>
          ) : null
        }
      />

      {jobs.length === 0 ? (
        <EmptyState
          icon={<ProjectsIcon className="h-5 w-5" />}
          title="No jobs yet."
          description={
            canManageJobs
              ? "Create the first job to start building the commission data set. No demo records are generated for you."
              : "Jobs appear here once they are created and assigned to you."
          }
          action={
            canManageJobs ? (
              <Link href="/commissions/jobs/new" className={buttonClassName({ size: "sm" })}>
                Create a job
              </Link>
            ) : null
          }
        />
      ) : (
        <TableWrap>
          <Table caption="Jobs with revenue, gross profit and commissionable gross profit">
            <thead>
              <tr>
                <Th>Job</Th>
                <Th>Customer</Th>
                <Th>Category</Th>
                <Th>Sales designer</Th>
                <Th>Status</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">GP</Th>
                <Th className="text-right">GP %</Th>
                <Th className="text-right">Commissionable GP</Th>
                <Th className="text-right">Commissionable GP %</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-surface-muted">
                  <Td>
                    <Link
                      href={`/commissions/jobs/${job.id}`}
                      className="font-medium text-ink underline-offset-4 hover:underline"
                    >
                      {job.jobName}
                    </Link>
                    {job.jobNumber ? (
                      <span className="block text-xs text-ink-subtle">{job.jobNumber}</span>
                    ) : null}
                  </Td>
                  <Td className="text-ink-muted">{formatText(job.customerName)}</Td>
                  <Td className="text-ink-muted">{formatText(job.categoryName)}</Td>
                  <Td className="text-ink-muted">{formatText(job.salesDesignerName)}</Td>
                  <Td>
                    <StatusBadge
                      label={jobStatusLabel(job.status)}
                      tone={jobStatusTone(job.status)}
                    />
                  </Td>
                  <TdNumeric>{formatMoney(job.actualTotalRevenue)}</TdNumeric>
                  <TdNumeric>{formatMoney(job.jobGrossProfit)}</TdNumeric>
                  <TdNumeric>{formatPercent(job.jobGpPercent)}</TdNumeric>
                  <TdNumeric>{formatMoney(job.commissionableGrossProfit)}</TdNumeric>
                  <TdNumeric>{formatPercent(job.commissionableGpPercent)}</TdNumeric>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <p className="text-xs leading-5 text-ink-subtle">
        Gross profit and commissionable gross profit are separate figures. Commissionable
        gross profit equals job gross profit until explicit exclusions are recorded against
        a job. Commission amounts are not calculated in this phase.
      </p>
    </div>
  );
}
