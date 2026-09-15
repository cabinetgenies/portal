"use client";

import { useActionState } from "react";

import {
  Field,
  FormAlert,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { updateJobFinancials } from "@/lib/commission/actions";
import {
  JOB_COST_RATE_FIELDS,
  JOB_ORIGINAL_FIELDS,
  jobCostRateValuesFromJob,
  jobMoneyValuesFromJob,
} from "@/lib/commission/job-entry";
import type { JobCostRateDefaults } from "@/lib/commission/financials";
import type { JobRow } from "@/lib/supabase/database.types";

/**
 * The original job inputs and the two cost rates.
 *
 * Change orders live in their own section: they are child records with their own
 * add/edit/remove actions, not numbers typed into this form. The Live Calculation
 * panel beside these sections shows the result of everything together, computed by
 * the shared engine.
 */
export function JobFinancialsForm({
  job,
  costRates,
}: {
  job: JobRow;
  costRates: JobCostRateDefaults;
}) {
  const [state, formAction] = useActionState(updateJobFinancials, undefined);
  const values = jobMoneyValuesFromJob(job);
  const rateValues = jobCostRateValuesFromJob(job, costRates);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="jobId" value={job.id} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {JOB_ORIGINAL_FIELDS.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={`money-${field.name}`}
            hint={field.hint}
            error={fieldError(state, field.name)}
          >
            <TextInput
              id={`money-${field.name}`}
              name={field.name}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={values[field.name]}
            />
          </Field>
        ))}

        {JOB_COST_RATE_FIELDS.map((field) => (
          <Field
            key={field.name}
            label={field.label}
            htmlFor={`rate-${field.name}`}
            hint={field.hint}
            error={fieldError(state, field.name)}
          >
            <TextInput
              id={`rate-${field.name}`}
              name={field.name}
              type="number"
              step="0.01"
              min="0"
              max="100"
              inputMode="decimal"
              defaultValue={rateValues[field.name]}
            />
          </Field>
        ))}
      </div>

      <p className="text-xs leading-5 text-ink-subtle">
        Original costs exclude change orders. Both rates apply to direct job cost —
        original costs plus change order costs — and are added to total cost before the
        commission tier is selected. Saving recalculates the job totals; a commission
        event already approved or paid keeps the figures it was calculated with, and
        reconciliation happens through the final true-up.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save financials" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
