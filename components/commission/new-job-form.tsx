"use client";

import { useActionState, useState } from "react";

import { LiveCalculationPanel } from "@/components/commission/live-calculation-panel";
import { Button } from "@/components/ui/button";
import {
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { createJob } from "@/lib/commission/actions";
import { toNumber } from "@/lib/commission/financials";
import {
  buildJobEntryLiveCalculation,
  emptyJobMoneyValues,
  JOB_COST_RATE_FIELDS,
  JOB_ORIGINAL_FIELDS,
  type JobCostRateValues,
  type JobEntryOptions,
  type JobMoneyFieldName,
  type JobMoneyValues,
} from "@/lib/commission/job-entry";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  type JobStatus,
} from "@/lib/commission/types";
import { fromDecimalPercent } from "@/lib/utils/percent";

type ChangeOrderDraft = {
  key: string;
  changeOrderNumber: string;
  name: string;
  revenue: string;
  cost: string;
};

/**
 * Creating a commission job.
 *
 * The financial model is deliberately small: original contract price, original
 * costs, and change orders as line items. There is no final audit here — a new job
 * is not audited when it is created; the audit happens on the job itself.
 *
 * The Live Calculation panel on the right is calculated from the shared engine on
 * every keystroke, so what the office sees is what gets stored.
 */
export function NewJobForm({
  options,
}: {
  options: JobEntryOptions;
}) {
  const [state, formAction] = useActionState(createJob, undefined);
  const [values, setValues] = useState<JobMoneyValues>(() => emptyJobMoneyValues());
  const [rateValues, setRateValues] = useState<JobCostRateValues>(() => ({
    burdenPercent: String(fromDecimalPercent(options.costRates.burdenPercent) ?? 0),
    warrantyContingencyPercent: String(
      fromDecimalPercent(options.costRates.warrantyContingencyPercent) ?? 0,
    ),
  }));
  const [changeOrders, setChangeOrders] = useState<ChangeOrderDraft[]>([]);
  const [designerId, setDesignerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [versionId, setVersionId] = useState("");

  const designer = options.designers.find((candidate) => candidate.id === designerId);
  const plan = options.plans.find((candidate) => candidate.id === planId);
  const versions = plan?.versions ?? [];
  const version = versions.find((candidate) => candidate.id === versionId);

  const calculation = buildJobEntryLiveCalculation({
    values,
    rateValues,
    changeOrders: changeOrders.map((row) => ({
      revenue: toNumber(row.revenue),
      cost: toNumber(row.cost),
    })),
    tiers: version?.tiers ?? [],
    // Rates come from the plan version's fixed GP bands only.
    minimumGpStandard: 0,
    settings: options.settings,
    onDraw: designer?.onDraw ?? false,
  });

  const setValue = (name: JobMoneyFieldName, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  const setRateValue = (name: keyof JobCostRateValues, value: string) =>
    setRateValues((current) => ({ ...current, [name]: value }));

  function addChangeOrder() {
    setChangeOrders((current) => [
      ...current,
      {
        key: `${Date.now()}-${current.length}`,
        changeOrderNumber: "",
        name: "",
        revenue: "",
        cost: "",
      },
    ]);
  }

  function updateChangeOrder(key: string, patch: Partial<ChangeOrderDraft>) {
    setChangeOrders((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeChangeOrder(key: string) {
    setChangeOrders((current) => current.filter((row) => row.key !== key));
  }

  function selectDesigner(nextDesignerId: string) {
    setDesignerId(nextDesignerId);

    // Default the plan from the assignment in force today. Clearing it when the
    // designer has none keeps a stale plan from a previous selection off the job.
    const nextDesigner = options.designers.find(
      (candidate) => candidate.id === nextDesignerId,
    );

    setPlanId(nextDesigner?.defaultPlanId ?? "");
    setVersionId(nextDesigner?.defaultPlanVersionId ?? "");
  }

  function selectPlan(nextPlanId: string) {
    setPlanId(nextPlanId);
    const nextPlan = options.plans.find((candidate) => candidate.id === nextPlanId);
    setVersionId(nextPlan?.versions[0]?.id ?? "");
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Basic information
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job name" htmlFor="job-name" error={fieldError(state, "jobName")}>
                <TextInput
                  id="job-name"
                  name="jobName"
                  placeholder="Reed kitchen remodel"
                  required
                  invalid={Boolean(fieldError(state, "jobName"))}
                />
              </Field>
              <Field label="Job number" htmlFor="job-number" error={fieldError(state, "jobNumber")}>
                <TextInput id="job-number" name="jobNumber" placeholder="CG-1042" />
              </Field>
              <Field
                label="Customer / owner name"
                htmlFor="customer-name"
                error={fieldError(state, "customerName")}
              >
                <TextInput id="customer-name" name="customerName" placeholder="Customer name" />
              </Field>
              <Field
                label="Sales designer"
                htmlFor="sales-designer"
                hint="One designer per job. Active portal users only."
                error={fieldError(state, "salesDesignerId")}
              >
                <Select
                  id="sales-designer"
                  name="salesDesignerId"
                  value={designerId}
                  onChange={(event) => selectDesigner(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {options.designers.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="job-status" error={fieldError(state, "status")}>
                <Select id="job-status" name="status" defaultValue={"presale" satisfies JobStatus}>
                  {JOB_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {JOB_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Sold date"
                htmlFor="sold-date"
                hint="Required once the job moves past presale. Commission plans resolve against this date."
                error={fieldError(state, "soldDate")}
              >
                <TextInput
                  id="sold-date"
                  name="soldDate"
                  type="date"
                  invalid={Boolean(fieldError(state, "soldDate"))}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Compensation
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Compensation plan"
                htmlFor="job-plan"
                error={fieldError(state, "compensationPlanId")}
              >
                <Select
                  id="job-plan"
                  name="compensationPlanId"
                  value={planId}
                  onChange={(event) => selectPlan(event.target.value)}
                >
                  <option value="">No plan attached</option>
                  {options.plans.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                      {option.active ? "" : " (inactive)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Plan version"
                htmlFor="job-plan-version"
                hint="Versions are effective-dated; a sold job keeps the version it was sold under."
                error={fieldError(state, "compensationPlanVersionId")}
              >
                <Select
                  id="job-plan-version"
                  name="compensationPlanVersionId"
                  value={versionId}
                  onChange={(event) => setVersionId(event.target.value)}
                >
                  <option value="">No version attached</option>
                  {versions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.versionName} ({option.effectiveFrom} →{" "}
                      {option.effectiveTo ?? "open"})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {designer?.defaultPlanId ? (
              <p className="text-xs leading-5 text-ink-subtle">
                Defaulted from {designer.name}&apos;s plan assignment in force today (
                {designer.defaultPlanName}). Change the plan above to override it for this job.
              </p>
            ) : designer ? (
              <p className="text-xs leading-5 text-ink-subtle">
                {designer.name} has no sales designer plan assignment in force today, so no
                plan was defaulted. The job can still be created and the plan attached later.
              </p>
            ) : (
              <p className="text-xs leading-5 text-ink-subtle">
                Only sales designer plans can be attached to a job. Manager plans are
                attributed to qualifying jobs separately.
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Original job
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
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
                    placeholder="0.00"
                    value={values[field.name]}
                    onChange={(event) => setValue(field.name, event.target.value)}
                  />
                </Field>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
            <p className="text-xs leading-5 text-ink-subtle">
              Both rates apply to direct job cost — original costs plus change order costs,
              before either is added — and are included in total cost before the commission
              tier is selected.
            </p>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Change orders
            </legend>
            <input
              type="hidden"
              name="changeOrders"
              value={JSON.stringify(
                changeOrders.map(({ changeOrderNumber, name, revenue, cost }) => ({
                  changeOrderNumber,
                  name,
                  revenue,
                  cost,
                })),
              )}
            />

            {changeOrders.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
                No change orders. Totals come from the original job only.
              </p>
            ) : (
              <ul className="space-y-3">
                {changeOrders.map((row, index) => (
                  <li
                    key={row.key}
                    className="space-y-3 rounded-lg border border-line bg-surface-muted p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
                        Change order {index + 1}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeChangeOrder(row.key)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Name" htmlFor={`co-name-${row.key}`}>
                        <TextInput
                          id={`co-name-${row.key}`}
                          value={row.name}
                          onChange={(event) =>
                            updateChangeOrder(row.key, { name: event.target.value })
                          }
                          placeholder="Additional cabinetry"
                        />
                      </Field>
                      <Field label="Number / #" htmlFor={`co-number-${row.key}`}>
                        <TextInput
                          id={`co-number-${row.key}`}
                          value={row.changeOrderNumber}
                          onChange={(event) =>
                            updateChangeOrder(row.key, {
                              changeOrderNumber: event.target.value,
                            })
                          }
                          placeholder="CO-1"
                        />
                      </Field>
                      <Field label="Revenue" htmlFor={`co-revenue-${row.key}`}>
                        <TextInput
                          id={`co-revenue-${row.key}`}
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={row.revenue}
                          onChange={(event) =>
                            updateChangeOrder(row.key, { revenue: event.target.value })
                          }
                        />
                      </Field>
                      <Field label="Costs" htmlFor={`co-cost-${row.key}`}>
                        <TextInput
                          id={`co-cost-${row.key}`}
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={row.cost}
                          onChange={(event) =>
                            updateChangeOrder(row.key, { cost: event.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Button type="button" variant="secondary" size="sm" onClick={addChangeOrder}>
              + Add change order
            </Button>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Deposit information
            </legend>
            <Field
              label="Deposit received date"
              htmlFor="deposit-date"
              hint={`Recording this date makes the deposit commission eligible: ${formatMoneyShort(
                calculation.commission.depositTarget,
              )} at the current projection. It does not create the event — the deposit commission is calculated deliberately from the job's Commission section.`}
              error={fieldError(state, "depositReceivedDate")}
            >
              <TextInput
                id="deposit-date"
                name="depositReceivedDate"
                type="date"
                className="sm:max-w-xs"
              />
            </Field>
            <p className="text-xs leading-5 text-ink-subtle">
              The final GP audit is not part of job creation. Once the job exists, its audit
              is a separate, explicit workflow on the job page.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <SubmitButton label="Create job" pendingLabel="Creating…" />
            <FormAlert state={state} className="flex-1" />
          </div>
        </div>

        <LiveCalculationPanel calculation={calculation} />
      </div>
    </form>
  );
}

function formatMoneyShort(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
