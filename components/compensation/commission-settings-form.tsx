"use client";

import { useActionState } from "react";

import {
  CheckboxField,
  Field,
  FormAlert,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import { saveCommissionSettings } from "@/lib/compensation/actions";
import { fromDecimalPercent } from "@/lib/utils/percent";

/**
 * Global commission rule inputs that are not part of a plan version.
 *
 * Saving adds (or replaces) an effective-dated row; existing commission events
 * keep the values they snapshotted, so editing these never rewrites history.
 */
export function CommissionSettingsForm({
  settings,
  defaultEffectiveFrom,
}: {
  settings: {
    depositPayoutPercent: number;
    drawRateReduction: number;
    drawEnabled: boolean;
    burdenPercent: number;
    warrantyContingencyPercent: number;
    notes: string | null;
  } | null;
  defaultEffectiveFrom: string;
}) {
  const [state, formAction] = useActionState(saveCommissionSettings, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Deposit payout (%)"
          htmlFor="settings-deposit"
          hint="Share of projected commission paid at deposit."
          error={fieldError(state, "depositPayoutPercent")}
        >
          <TextInput
            id="settings-deposit"
            name="depositPayoutPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={
              fromDecimalPercent(settings?.depositPayoutPercent ?? 0.5) ?? 50
            }
            required
          />
        </Field>
        <Field
          label="Draw rate reduction (points)"
          htmlFor="settings-draw-reduction"
          hint="Absolute percentage points removed from the rate while on draw."
          error={fieldError(state, "drawRateReduction")}
        >
          <TextInput
            id="settings-draw-reduction"
            name="drawRateReduction"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={
              fromDecimalPercent(settings?.drawRateReduction ?? 0.05) ?? 5
            }
            required
          />
        </Field>
        <Field
          label="Effective from"
          htmlFor="settings-effective-from"
          hint="Applies to calculations from this date onward."
          error={fieldError(state, "effectiveFrom")}
        >
          <TextInput
            id="settings-effective-from"
            name="effectiveFrom"
            type="date"
            defaultValue={defaultEffectiveFrom}
            required
          />
        </Field>
      </div>

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Burden (%)"
          htmlFor="settings-burden"
          hint="Applied to direct job cost: material + labor + subcontractor + other direct."
          error={fieldError(state, "burdenPercent")}
        >
          <TextInput
            id="settings-burden"
            name="burdenPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={fromDecimalPercent(settings?.burdenPercent ?? 0) ?? 0}
            required
          />
        </Field>
        <Field
          label="Warranty / service contingency (%)"
          htmlFor="settings-warranty"
          hint="Applied to the same direct job cost base as burden."
          error={fieldError(state, "warrantyContingencyPercent")}
        >
          <TextInput
            id="settings-warranty"
            name="warrantyContingencyPercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={
              fromDecimalPercent(settings?.warrantyContingencyPercent ?? 0) ?? 0
            }
            required
          />
        </Field>
        <div className="flex items-end pb-1 sm:col-span-2">
          <CheckboxField
            label="Draw system enabled"
            name="drawEnabled"
            defaultChecked={settings?.drawEnabled ?? true}
            hint="When off, draw enrollment is ignored in calculations."
          />
        </div>
      </div>

      <p className="text-xs leading-5 text-ink-subtle">
        Burden and warranty percentages are the company defaults for new jobs. A job
        snapshots the rates it was saved with, so changing these never rewrites an existing
        job&apos;s cost structure or any commission already calculated from it. Both rates
        apply to direct job cost — never to revenue — and are included in total job cost
        before the commission tier is selected.
      </p>

      <Field label="Notes" htmlFor="settings-notes" error={fieldError(state, "notes")}>
        <TextInput
          id="settings-notes"
          name="notes"
          placeholder="Who approved this change and why"
          defaultValue={settings?.notes ?? ""}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save commission settings" pendingLabel="Saving…" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
