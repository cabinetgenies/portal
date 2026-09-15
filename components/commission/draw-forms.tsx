"use client";

import { useActionState } from "react";

import {
  Field,
  FormAlert,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import {
  createDrawAdjustment,
  createDrawAdvance,
  createRolloverAdjustment,
  endEmployeeDraw,
  placeEmployeeOnDraw,
} from "@/lib/commission/draw-actions";

export function DrawEnrollmentForm({
  profileId,
  onDraw,
  openPeriodFrom,
  today,
}: {
  profileId: string;
  onDraw: boolean;
  openPeriodFrom: string | null;
  today: string;
}) {
  const [placeState, placeAction] = useActionState(placeEmployeeOnDraw, undefined);
  const [endState, endAction] = useActionState(endEmployeeDraw, undefined);

  if (onDraw) {
    return (
      <form action={endAction} className="space-y-3">
        <input type="hidden" name="profileId" value={profileId} />
        <p className="text-sm text-ink-muted">
          On draw since {openPeriodFrom ?? "—"}. Closing the period keeps the history and
          leaves any outstanding balance on the draw ledger.
        </p>
        <Field
          label="Draw ends on"
          htmlFor={`draw-end-${profileId}`}
          error={fieldError(endState, "effectiveTo")}
        >
          <TextInput
            id={`draw-end-${profileId}`}
            name="effectiveTo"
            type="date"
            defaultValue={today}
            required
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label="Remove from draw" pendingLabel="Saving…" size="sm" />
          <FormAlert state={endState} className="flex-1" />
        </div>
      </form>
    );
  }

  return (
    <form action={placeAction} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <Field
        label="Place on draw from"
        htmlFor={`draw-start-${profileId}`}
        hint="Commission calculated for jobs inside this period uses the reduced draw rate."
        error={fieldError(placeState, "effectiveFrom")}
      >
        <TextInput
          id={`draw-start-${profileId}`}
          name="effectiveFrom"
          type="date"
          defaultValue={today}
          required
        />
      </Field>
      <Field label="Notes" htmlFor={`draw-notes-${profileId}`}>
        <TextInput
          id={`draw-notes-${profileId}`}
          name="notes"
          placeholder="Draw agreement reference (optional)"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Place on draw" pendingLabel="Saving…" size="sm" />
        <FormAlert state={placeState} className="flex-1" />
      </div>
    </form>
  );
}

export function DrawAdvanceForm({ profileId }: { profileId: string }) {
  const [state, formAction] = useActionState(createDrawAdvance, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Advance amount"
          htmlFor={`draw-advance-${profileId}`}
          error={fieldError(state, "amount")}
        >
          <TextInput
            id={`draw-advance-${profileId}`}
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            placeholder="2500.00"
            required
          />
        </Field>
        <Field
          label="Reason"
          htmlFor={`draw-advance-reason-${profileId}`}
          error={fieldError(state, "reason")}
        >
          <TextInput
            id={`draw-advance-reason-${profileId}`}
            name="reason"
            placeholder="Monthly draw advance — September"
            required
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Record advance" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function LedgerAdjustmentForm({
  profileId,
  ledger,
}: {
  profileId: string;
  ledger: "draw" | "rollover";
}) {
  const action = ledger === "draw" ? createDrawAdjustment : createRolloverAdjustment;
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Adjustment amount"
          htmlFor={`${ledger}-adjustment-${profileId}`}
          hint="Positive increases the balance, negative reduces it."
          error={fieldError(state, "amount")}
        >
          <TextInput
            id={`${ledger}-adjustment-${profileId}`}
            name="amount"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="-500.00"
            required
          />
        </Field>
        <Field
          label="Reason"
          htmlFor={`${ledger}-adjustment-reason-${profileId}`}
          error={fieldError(state, "reason")}
        >
          <TextInput
            id={`${ledger}-adjustment-reason-${profileId}`}
            name="reason"
            placeholder="Documented correction approved by …"
            required
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Record adjustment" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
