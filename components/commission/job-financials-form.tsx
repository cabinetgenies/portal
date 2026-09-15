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
import { computeJobFinancials, toNumber } from "@/lib/commission/financials";
import type { JobAdjustmentInput } from "@/lib/commission/types";
import type { JobRow } from "@/lib/supabase/database.types";
import { formatMoney, formatPercent } from "@/lib/utils/format";

const REVENUE_FIELDS = [
  { name: "contractRevenue", column: "contract_revenue", label: "Contract revenue" },
  {
    name: "changeOrderRevenue",
    column: "change_order_revenue",
    label: "Change order revenue",
  },
  { name: "otherRevenue", column: "other_revenue", label: "Other revenue" },
  { name: "creditAmount", column: "credit_amount", label: "Credits (reduce revenue)" },
] as const;

const COST_FIELDS = [
  { name: "materialCost", column: "material_cost", label: "Material" },
  { name: "laborCost", column: "labor_cost", label: "Labor" },
  { name: "subcontractorCost", column: "subcontractor_cost", label: "Subcontractor" },
  { name: "otherDirectCost", column: "other_direct_cost", label: "Other direct cost" },
  { name: "burdenCost", column: "burden_cost", label: "Burden" },
  {
    name: "warrantyServiceContingency",
    column: "warranty_service_contingency",
    label: "Warranty / service contingency",
  },
] as const;

type MoneyFieldName =
  | (typeof REVENUE_FIELDS)[number]["name"]
  | (typeof COST_FIELDS)[number]["name"];

function initialValues(job: JobRow): Record<MoneyFieldName, string> {
  const entries = [...REVENUE_FIELDS, ...COST_FIELDS].map((field) => [
    field.name,
    String(toNumber(job[field.column])),
  ]);

  return Object.fromEntries(entries) as Record<MoneyFieldName, string>;
}

/**
 * Job revenue and cost inputs, with a live preview of the derived figures.
 *
 * The preview calls the same `computeJobFinancials` function the Server Action
 * persists with, so what accounting sees here is exactly what gets stored.
 */
export function JobFinancialsForm({
  job,
  adjustments,
}: {
  job: JobRow;
  adjustments: JobAdjustmentInput[];
}) {
  const [state, formAction] = useActionState(updateJobFinancials, undefined);
  const [values, setValues] = useState<Record<MoneyFieldName, string>>(() =>
    initialValues(job),
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
      burdenCost: toNumber(values.burdenCost),
      warrantyServiceContingency: toNumber(values.warrantyServiceContingency),
    },
    adjustments,
  );

  const setValue = (name: MoneyFieldName, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="jobId" value={job.id} />

      <div className="grid gap-5 lg:grid-cols-2">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
            Revenue
          </legend>
          {REVENUE_FIELDS.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`money-${field.name}`}
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
            Cost
          </legend>
          {COST_FIELDS.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              htmlFor={`money-${field.name}`}
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
      </div>

      <section
        aria-label="Calculated totals"
        className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Preview label="Total job revenue" value={formatMoney(preview.actualTotalRevenue)} />
        <Preview label="Total job cost" value={formatMoney(preview.actualTotalCost)} />
        <Preview label="Job gross profit" value={formatMoney(preview.jobGrossProfit)} />
        <Preview label="Job GP %" value={formatPercent(preview.jobGpPercent)} />
        <Preview
          label="Commissionable revenue"
          value={formatMoney(preview.commissionableRevenue)}
        />
        <Preview
          label="Commissionable cost"
          value={formatMoney(preview.commissionableCost)}
        />
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
        Commissionable totals include the explicit adjustments recorded in the Audit /
        Adjustments section. With no exclusions they match job gross profit.
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
    <div className="space-y-0.5">
      <p className="text-xs font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {label}
      </p>
      <p className="font-mono text-sm tabular-nums text-ink">{value}</p>
    </div>
  );
}
