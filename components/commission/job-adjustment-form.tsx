"use client";

import { useActionState } from "react";

import {
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { createJobFinancialAdjustment } from "@/lib/commission/actions";
import {
  ADJUSTMENT_TYPES,
  ADJUSTMENT_TYPE_HINTS,
  ADJUSTMENT_TYPE_LABELS,
} from "@/lib/commission/types";

/**
 * Adjustments are append-only: corrections are new rows, never edits, so the
 * reason a job's numbers changed is always recoverable.
 */
export function JobAdjustmentForm({ jobId }: { jobId: string }) {
  const [state, formAction] = useActionState(
    createJobFinancialAdjustment,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_2fr]">
        <Field
          label="Adjustment type"
          htmlFor={`adjustment-type-${jobId}`}
          error={fieldError(state, "adjustmentType")}
        >
          <Select
            id={`adjustment-type-${jobId}`}
            name="adjustmentType"
            defaultValue="commissionable_revenue"
          >
            {ADJUSTMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {ADJUSTMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Amount"
          htmlFor={`adjustment-amount-${jobId}`}
          hint="Negative reduces."
          error={fieldError(state, "amount")}
        >
          <TextInput
            id={`adjustment-amount-${jobId}`}
            name="amount"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="-2500.00"
            required
            invalid={Boolean(fieldError(state, "amount"))}
          />
        </Field>
        <Field
          label="Reason"
          htmlFor={`adjustment-reason-${jobId}`}
          error={fieldError(state, "reason")}
        >
          <TextInput
            id={`adjustment-reason-${jobId}`}
            name="reason"
            placeholder="Warranty reserve excluded from commissions (approved by …)"
            required
            invalid={Boolean(fieldError(state, "reason"))}
          />
        </Field>
      </div>

      <ul className="space-y-1 text-xs leading-5 text-ink-subtle">
        {ADJUSTMENT_TYPES.map((type) => (
          <li key={type}>
            <span className="font-medium text-ink-muted">
              {ADJUSTMENT_TYPE_LABELS[type]}:
            </span>{" "}
            {ADJUSTMENT_TYPE_HINTS[type]}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Record adjustment" pendingLabel="Recording…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
