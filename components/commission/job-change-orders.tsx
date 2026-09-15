"use client";

import { useActionState } from "react";

import { ActionButtonForm } from "@/components/ui/action-button-form";
import {
  Field,
  FormAlert,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import {
  createJobChangeOrder,
  setJobChangeOrderActive,
  updateJobChangeOrder,
} from "@/lib/commission/actions";
import { changeOrderLabel } from "@/lib/commission/change-orders";
import type { JobChangeOrderRow } from "@/lib/supabase/database.types";
import { formatMoney } from "@/lib/utils/format";

/**
 * Change order entry.
 *
 * Each change order is a child record: number/name, revenue and cost. Removing one
 * deactivates it rather than deleting it, which is what keeps the history intact
 * after commission has been paid. Every save recalculates the job's roll-ups and
 * derived figures through the canonical calculation.
 */
export function ChangeOrderCreateForm({ jobId }: { jobId: string }) {
  const [state, formAction] = useActionState(createJobChangeOrder, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Name" htmlFor={`co-new-name-${jobId}`} error={fieldError(state, "name")}>
          <TextInput
            id={`co-new-name-${jobId}`}
            name="name"
            placeholder="Additional cabinetry"
            required
          />
        </Field>
        <Field label="Number / #" htmlFor={`co-new-number-${jobId}`}>
          <TextInput
            id={`co-new-number-${jobId}`}
            name="changeOrderNumber"
            placeholder="CO-1"
          />
        </Field>
        <Field
          label="Revenue"
          htmlFor={`co-new-revenue-${jobId}`}
          error={fieldError(state, "revenue")}
        >
          <TextInput
            id={`co-new-revenue-${jobId}`}
            name="revenue"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
        <Field label="Costs" htmlFor={`co-new-cost-${jobId}`} error={fieldError(state, "cost")}>
          <TextInput
            id={`co-new-cost-${jobId}`}
            name="cost"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Add change order" pendingLabel="Adding…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function ChangeOrderCard({
  jobId,
  changeOrder,
}: {
  jobId: string;
  changeOrder: JobChangeOrderRow;
}) {
  const [state, formAction] = useActionState(updateJobChangeOrder, undefined);
  const label = changeOrderLabel(changeOrder);
  const grossProfitImpact = changeOrder.revenue - changeOrder.cost;

  return (
    <li className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-ink">{label}</p>
          <p className="text-xs text-ink-muted">
            Revenue {formatMoney(changeOrder.revenue)} · Costs{" "}
            {formatMoney(changeOrder.cost)} · GP impact {formatMoney(grossProfitImpact)}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <details className="min-w-[22rem]">
            <summary className="cursor-pointer text-sm font-medium text-ink">Edit</summary>
            <form action={formAction} className="mt-3 space-y-3">
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="changeOrderId" value={changeOrder.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Name"
                  htmlFor={`co-name-${changeOrder.id}`}
                  error={fieldError(state, "name")}
                >
                  <TextInput
                    id={`co-name-${changeOrder.id}`}
                    name="name"
                    defaultValue={changeOrder.name}
                    required
                  />
                </Field>
                <Field label="Number / #" htmlFor={`co-number-${changeOrder.id}`}>
                  <TextInput
                    id={`co-number-${changeOrder.id}`}
                    name="changeOrderNumber"
                    defaultValue={changeOrder.change_order_number ?? ""}
                  />
                </Field>
                <Field
                  label="Revenue"
                  htmlFor={`co-revenue-${changeOrder.id}`}
                  error={fieldError(state, "revenue")}
                >
                  <TextInput
                    id={`co-revenue-${changeOrder.id}`}
                    name="revenue"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    defaultValue={String(changeOrder.revenue)}
                  />
                </Field>
                <Field
                  label="Costs"
                  htmlFor={`co-cost-${changeOrder.id}`}
                  error={fieldError(state, "cost")}
                >
                  <TextInput
                    id={`co-cost-${changeOrder.id}`}
                    name="cost"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    defaultValue={String(changeOrder.cost)}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton label="Save change order" pendingLabel="Saving…" size="sm" />
                <FormAlert state={state} className="flex-1" />
              </div>
            </form>
          </details>

          <ActionButtonForm
            action={setJobChangeOrderActive}
            fields={{ jobId, changeOrderId: changeOrder.id, active: "false" }}
            label="Remove"
            pendingLabel="Removing…"
          />
        </div>
      </div>
    </li>
  );
}
