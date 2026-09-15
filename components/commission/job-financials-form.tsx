"use client";

import { useActionState, useState } from "react";

import {
  Field,
  FormAlert,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { updateJobFinancials } from "@/lib/commission/actions";
import {
  computeJobFinancials,
  toNumber,
  type JobCostRateDefaults,
} from "@/lib/commission/financials";
import {
  costRateValuesToDecimals,
  JOB_COST_FIELDS,
  JOB_COST_RATE_FIELDS,
  JOB_REVENUE_FIELDS,
  jobCostRateValuesFromJob,
  jobMoneyValuesFromJob,
  type JobCostRateValues,
  type JobMoneyFieldName,
  type JobMoneyValues,
} from "@/lib/commission/job-entry";
import type { JobAdjustmentInput } from "@/lib/commission/types";
import type { JobRow } from "@/lib/supabase/database.types";
import { formatMoney, formatPercent } from "@/lib/utils/format";

/**
 * Job revenue and direct cost inputs, with a live preview of the derived figures.
 *
 * Burden and warranty / service contingency are entered as percentages of direct
 * job cost; their dollar amounts are derived. The preview calls the same
 * `computeJobFinancials` function the Server Action persists with, so what
 * accounting sees here is exactly what gets stored.
 */
export function JobFinancialsForm({
  job,
  adjustments,
  costRates,
}: {
  job: JobRow;
  adjustments: JobAdjustmentInput[];
  costRates: JobCostRateDefaults;
}) {
  const [state, formAction] = useActionState(updateJobFinancials, undefined);
  const [values, setValues] = useState<JobMoneyValues>(() => jobMoneyValuesFromJob(job));
  const [rateValues, setRateValues] = useState<JobCostRateValues>(() =>
    jobCostRateValuesFromJob(job, costRates),
  );

  const preview = computeJobFinancials(
    {
      contractRevenue: toNumber(values.contractRevenue),
      changeOrderRevenue: toNumber(values.changeOrderRevenue),
      creditAmount: toNumber(values.creditAmount),
      otherRevenue: toNumber(values.otherRevenue),
      materialCost: toNumber(values.materialCost),
      laborCost: toNumber(values.laborCost),
      subcontractorCost: toNumber(values.subcontractorCost),
      otherDirectCost: toNumber(values.otherDirectCost),
      ...costRateValuesToDecimals(rateValues),
    },
    adjustments,
  );

  const setValue = (name: JobMoneyFieldName, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  const setRateValue = (name: keyof JobCostRateValues, value: string) =>
    setRateValues((current) => ({ ...current, [name]: value }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="jobId" value={job.id} />

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Revenue
          </legend>
          {JOB_REVENUE_FIELDS.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`money-${field.name}`}
              hint={field.hint || undefined}
              error={fieldError(state, field.name)}
            >
              <TextInput
                id={`money-${field.name}`}
                name={field.name}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={values[field.name]}
                onChange={(event) => setValue(field.name, event.target.value)}
              />
            </Field>
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Direct cost
          </legend>
          {JOB_COST_FIELDS.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`money-${field.name}`}
              hint={field.hint || undefined}
              error={fieldError(state, field.name)}
            >
              <TextInput
                id={`money-${field.name}`}
                name={field.name}
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={values[field.name]}
                onChange={(event) => setValue(field.name, event.target.value)}
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
                value={rateValues[field.name]}
                onChange={(event) => setRateValue(field.name, event.target.value)}
              />
            </Field>
          ))}
        </fieldset>
      </div>

      <section
        aria-label="Calculated totals"
        className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Preview label="Direct job cost" value={formatMoney(preview.directJobCost)} />
        <Preview
          label={`Burden (${formatPercent(preview.burdenPercent, 2)})`}
          value={formatMoney(preview.burdenCost)}
        />
        <Preview
          label={`Warranty contingency (${formatPercent(preview.warrantyContingencyPercent, 2)})`}
          value={formatMoney(preview.warrantyServiceContingency)}
        />
        <Preview label="Total job cost" value={formatMoney(preview.actualTotalCost)} />
        <Preview label="Total job revenue" value={formatMoney(preview.actualTotalRevenue)} />
        <Preview label="Job gross profit" value={formatMoney(preview.jobGrossProfit)} />
        <Preview label="Job GP %" value={formatPercent(preview.jobGpPercent)} />
        <Preview label="Commissionable revenue" value={formatMoney(preview.commissionableRevenue)} />
        <Preview label="Commissionable cost" value={formatMoney(preview.commissionableCost)} />
        <Preview
          label="Commissionable GP"
          value={formatMoney(preview.commissionableGrossProfit)}
        />
        <Preview
          label="Commissionable GP %"
          value={formatPercent(preview.commissionableGpPercent)}
        />
      </section>

      <p className="text-xs leading-5 text-ink-subtle">
        Total job cost is direct job cost plus the calculated burden and warranty contingency,
        so those amounts are never added twice. Commissionable totals include the explicit
        adjustments recorded in the Events / history section; with no exclusions they match job
        gross profit.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save financials" pendingLabel="Saving…" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </p>
      <p className="font-mono text-sm tabular-nums text-ink">{value}</p>
    </div>
  );
}
