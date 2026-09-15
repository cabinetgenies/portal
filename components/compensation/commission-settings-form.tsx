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
        <div className="flex items-end pb-1">
          <CheckboxField
            label="Draw system enabled"
            name="drawEnabled"
            defaultChecked={settings?.drawEnabled ?? true}
            hint="When off, draw enrollment is ignored in calculations."
          />
        </div>
      </div>

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
