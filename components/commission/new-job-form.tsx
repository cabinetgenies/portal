"use client";

import { useActionState, useState } from "react";

import {
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { InfoIcon } from "@/components/icons";
import { createJob } from "@/lib/commission/actions";
import { toNumber } from "@/lib/commission/financials";
import {
  buildJobEntryPreview,
  emptyJobMoneyValues,
  JOB_COST_FIELDS,
  JOB_REVENUE_FIELDS,
  type JobEntryOptions,
  type JobMoneyFieldName,
  type JobMoneyValues,
} from "@/lib/commission/job-entry";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  type JobStatus,
} from "@/lib/commission/types";
import type { ProjectCategoryRow } from "@/lib/supabase/database.types";
import { formatMoney, formatPercent } from "@/lib/utils/format";

/**
 * Creating a commission job.
 *
 * Everything a job needs to be commission-sized is captured in one pass —
 * identity, milestone dates, the governing plan version and the revenue and cost
 * structure — and the read-only summary on the right is calculated live from the
 * canonical domain engine, so what the administrator sees is what gets stored.
 *
 * The form is a data-entry surface for commission and financial audit only. It is
 * not a project management screen: Buildertrend stays the system of record for
 * schedules, selections and production.
 */
export function NewJobForm({
  categories,
  options,
}: {
  categories: ProjectCategoryRow[];
  options: JobEntryOptions;
}) {
  const [state, formAction] = useActionState(createJob, undefined);
  const [values, setValues] = useState<JobMoneyValues>(() => emptyJobMoneyValues());
  const [categoryId, setCategoryId] = useState("");
  const [designerId, setDesignerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [versionId, setVersionId] = useState("");

  const designer = options.designers.find((candidate) => candidate.id === designerId);
  const category = categories.find((candidate) => candidate.id === categoryId);
  const plan = options.plans.find((candidate) => candidate.id === planId);
  const versions = plan?.versions ?? [];
  const version = versions.find((candidate) => candidate.id === versionId);

  const preview = buildJobEntryPreview({
    values,
    tiers: version?.tiers ?? [],
    // Postgres numeric can arrive as a string; the engine expects a number.
    minimumGpStandard: toNumber(category?.minimum_gp_standard),
    settings: options.settings,
    onDraw: designer?.onDraw ?? false,
  });

  const setValue = (name: JobMoneyFieldName, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

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
              <Field
                label="Job name"
                htmlFor="job-name"
                hint="Buildertrend job names can be reused here for finance matching."
                error={fieldError(state, "jobName")}
              >
                <TextInput
                  id="job-name"
                  name="jobName"
                  placeholder="Commission Test 50 GP"
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
                label="Project category"
                htmlFor="project-category"
                hint="Each category carries its own minimum GP standard."
                error={fieldError(state, "projectCategoryId")}
              >
                <Select
                  id="project-category"
                  name="projectCategoryId"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  required
                  invalid={Boolean(fieldError(state, "projectCategoryId"))}
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.code})
                    </option>
                  ))}
                </Select>
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
                {designer.defaultPlanName}). Change the plan above to override it for this job
                — the job keeps whichever version is attached here.
              </p>
            ) : designer ? (
              <p className="text-xs leading-5 text-ink-subtle">
                {designer.name} has no sales designer plan assignment in force today
                {designer.compensationEligible
                  ? ""
                  : " and is not marked compensation eligible"}
                , so no plan was defaulted. The job can still be created and the plan attached
                later.
              </p>
            ) : (
              <p className="text-xs leading-5 text-ink-subtle">
                Only sales designer plans can be attached to a job. Manager plans are
                attributed to qualifying jobs separately and are never a share of a
                designer&apos;s commission.
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Revenue
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {JOB_REVENUE_FIELDS.map((field) => (
                <Field
                  key={field.name}
                  label={field.label}
                  htmlFor={`revenue-${field.name}`}
                  hint={field.hint || undefined}
                  error={fieldError(state, field.name)}
                >
                  <TextInput
                    id={`revenue-${field.name}`}
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
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Costs
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {JOB_COST_FIELDS.map((field) => (
                <Field
                  key={field.name}
                  label={field.label}
                  htmlFor={`cost-${field.name}`}
                  hint={field.hint || undefined}
                  error={fieldError(state, field.name)}
                >
                  <TextInput
                    id={`cost-${field.name}`}
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
            <p className="text-xs leading-5 text-ink-subtle">
              Total job cost is the sum of these six inputs, burden included. Job gross profit
              is revenue minus that total — the single shared calculation, not a form-local
              formula.
            </p>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Deposit
            </legend>
            <Field
              label="Deposit received date"
              htmlFor="deposit-date"
              hint={`Recording this date makes the deposit commission eligible: ${formatPercent(
                options.settings.depositPayoutPercent,
                0,
              )} of projected commission, currently ${formatMoney(preview.depositTarget)} for this job.`}
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
              A deposit date makes the deposit commission <em>eligible</em> — it does not
              create the event. The deposit commission is still calculated deliberately from
              the job&apos;s Commission section. The jobs table has no separate deposit amount
              column: the deposit target is derived from the plan version and the deposit
              payout percentage under Admin → Commission settings.
            </p>
          </fieldset>

          <fieldset className="space-y-4 border-t border-line pt-6">
            <legend className="text-xs font-semibold tracking-[0.12em] text-ink-subtle uppercase">
              Final GP audit
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="GP audit completed date"
                htmlFor="gp-audit-date"
                hint="Records that the final gross profit is audited."
                error={fieldError(state, "gpAuditCompletedDate")}
              >
                <TextInput id="gp-audit-date" name="gpAuditCompletedDate" type="date" />
              </Field>
              <Field
                label="Completion date"
                htmlFor="completion-date"
                hint="Optional. Used by the final audit queue."
                error={fieldError(state, "completionDate")}
              >
                <TextInput id="completion-date" name="completionDate" type="date" />
              </Field>
            </div>
            <p className="text-xs leading-5 text-ink-subtle">
              The GP audit date makes the final true-up <em>eligible</em>. Nothing here creates
              a final commission automatically: an administrator still calculates it from the
              job&apos;s Commission section, so the workflow stays under human control.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
            <SubmitButton label="Create job" pendingLabel="Creating…" />
            <FormAlert state={state} className="flex-1" />
          </div>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-tight text-ink">
                Live calculation
              </h2>
              <p className="text-xs leading-5 text-ink-subtle">
                Read-only. Every figure below comes from the shared commission engine — the
                same functions that store the job totals and calculate commission events.
              </p>
            </div>

            <dl className="space-y-3">
              <PreviewRow
                label="Revenue"
                value={formatMoney(preview.financials.actualTotalRevenue)}
              />
              <PreviewRow label="Cost" value={formatMoney(preview.financials.actualTotalCost)} />
              <PreviewRow
                label="Commissionable GP"
                value={formatMoney(preview.financials.commissionableGrossProfit)}
              />
              <PreviewRow
                label="Commissionable GP %"
                value={formatPercent(preview.financials.commissionableGpPercent)}
              />
              <PreviewRow
                label="Job GP"
                value={`${formatMoney(preview.financials.jobGrossProfit)} · ${formatPercent(
                  preview.financials.jobGpPercent,
                )}`}
              />
            </dl>

            <dl className="space-y-3 border-t border-line pt-4">
              <PreviewRow
                label="Applicable tier"
                value={
                  !preview.hasTiers
                    ? "No plan version attached"
                    : preview.tierLabel ?? "No matching tier"
                }
              />
              <PreviewRow label="Standard rate" value={formatPercent(preview.standardRate)} />
              <PreviewRow
                label="Draw reduction"
                value={
                  preview.drawReductionApplied > 0
                    ? `− ${formatPercent(preview.drawReductionApplied)}`
                    : "Not on draw"
                }
              />
              <PreviewRow
                label="Effective commission rate"
                value={formatPercent(preview.effectiveRate)}
              />
              <PreviewRow
                label="Projected gross commission"
                value={formatMoney(preview.projectedGrossCommission)}
                emphasis
              />
              <PreviewRow
                label="Deposit target"
                value={`${formatMoney(preview.depositTarget)} · ${formatPercent(
                  preview.depositPayoutPercent,
                  0,
                )}`}
                emphasis
              />
            </dl>

            {preview.warnings.length > 0 ? (
              <ul className="space-y-2 border-t border-line pt-4">
                {preview.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-2 text-xs leading-5 text-ink-muted">
                    <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-subtle" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="border-t border-line pt-4 text-xs leading-5 text-ink-subtle">
              Draw and rollover balances are not applied here. They affect actual cash when a
              commission event is created, and they are shown on the job&apos;s Commission
              section.
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}

function PreviewRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs leading-5 text-ink-muted">{label}</dt>
      <dd
        className={
          emphasis
            ? "font-mono text-sm font-semibold tabular-nums text-ink"
            : "font-mono text-sm tabular-nums text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}
