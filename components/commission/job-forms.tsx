"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { AlertIcon } from "@/components/icons";
import {
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { createJob, updateJobOverview } from "@/lib/commission/actions";
import type { SalesDesignerOption } from "@/lib/compensation/queries";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  type JobStatus,
} from "@/lib/commission/types";
import type { JobRow } from "@/lib/supabase/database.types";

type JobFormProps = {
  designers: SalesDesignerOption[];
  job?: JobRow;
};

/**
 * Job identity, workflow status and sales-designer assignment.
 *
 * The designer picker shows whether the selected person has a commission plan
 * assignment in force, but it never blocks the save — the warning is informational.
 */
export function JobOverviewForm({ designers, job }: JobFormProps) {
  const [state, formAction] = useActionState(
    job ? updateJobOverview : createJob,
    undefined,
  );
  const [designerId, setDesignerId] = useState(job?.sales_designer_id ?? "");
  const selectedDesigner = designers.find((designer) => designer.id === designerId);

  return (
    <form action={formAction} className="space-y-5">
      {job ? <input type="hidden" name="jobId" value={job.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Job name" htmlFor="job-name" error={fieldError(state, "jobName")}>
          <TextInput
            id="job-name"
            name="jobName"
            defaultValue={job?.job_name ?? ""}
            placeholder="Reed kitchen remodel"
            required
            invalid={Boolean(fieldError(state, "jobName"))}
          />
        </Field>
        <Field
          label="Job number"
          htmlFor="job-number"
          hint="Optional. Buildertrend numbers can be added later."
          error={fieldError(state, "jobNumber")}
        >
          <TextInput
            id="job-number"
            name="jobNumber"
            defaultValue={job?.job_number ?? ""}
            placeholder="CG-1042"
          />
        </Field>
        <Field
          label="Customer"
          htmlFor="customer-name"
          error={fieldError(state, "customerName")}
        >
          <TextInput
            id="customer-name"
            name="customerName"
            defaultValue={job?.customer_name ?? ""}
            placeholder="Customer name"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Status" htmlFor="job-status" error={fieldError(state, "status")}>
          <Select
            id="job-status"
            name="status"
            defaultValue={(job?.status as JobStatus | undefined) ?? "presale"}
          >
            {JOB_STATUSES.map((status) => (
              <option key={status} value={status}>
                {JOB_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Sales designer"
          htmlFor="sales-designer"
          hint="Only active portal users are listed."
          error={fieldError(state, "salesDesignerId")}
        >
          <Select
            id="sales-designer"
            name="salesDesignerId"
            value={designerId}
            onChange={(event) => setDesignerId(event.target.value)}
          >
            <option value="">Unassigned</option>
            {designers.map((designer) => (
              <option key={designer.id} value={designer.id}>
                {designer.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {selectedDesigner && !selectedDesigner.hasCurrentAssignment ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-2.5"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 text-accent-strong" />
          <p className="text-sm leading-6 text-accent-strong">
            {selectedDesigner.name} has no commission plan assignment in force today
            {selectedDesigner.compensationEligible
              ? ""
              : " and is not marked compensation eligible"}
            . The job can still be saved; assign a plan under Commissions → Employees before
            the job is sold.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Sold date" htmlFor="sold-date" error={fieldError(state, "soldDate")}>
          <TextInput
            id="sold-date"
            name="soldDate"
            type="date"
            defaultValue={job?.sold_date ?? ""}
            invalid={Boolean(fieldError(state, "soldDate"))}
          />
        </Field>
        <Field
          label="Deposit received"
          htmlFor="deposit-date"
          error={fieldError(state, "depositReceivedDate")}
        >
          <TextInput
            id="deposit-date"
            name="depositReceivedDate"
            type="date"
            defaultValue={job?.deposit_received_date ?? ""}
          />
        </Field>
        <Field
          label="Completion date"
          htmlFor="completion-date"
          error={fieldError(state, "completionDate")}
        >
          <TextInput
            id="completion-date"
            name="completionDate"
            type="date"
            defaultValue={job?.completion_date ?? ""}
          />
        </Field>
        <Field
          label="GP audit completed"
          htmlFor="gp-audit-date"
          error={fieldError(state, "gpAuditCompletedDate")}
        >
          <TextInput
            id="gp-audit-date"
            name="gpAuditCompletedDate"
            type="date"
            defaultValue={job?.gp_audit_completed_date ?? ""}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          label={job ? "Save job" : "Create job"}
          pendingLabel={job ? "Saving…" : "Creating…"}
        />
        <FormAlert state={state} className="flex-1" />
        {job ? (
          <Link
            href="/sales/commissions/jobs"
            className="text-sm font-medium text-ink-muted hover:text-ink"
          >
            Back to jobs
          </Link>
        ) : null}
      </div>
    </form>
  );
}
