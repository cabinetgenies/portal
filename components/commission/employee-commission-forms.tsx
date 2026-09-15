"use client";

import { useActionState } from "react";

import {
  CheckboxField,
  Field,
  FormAlert,
  Select,
  SubmitButton,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import {
  createEmployeeCommissionAssignment,
  saveEmployeeCommissionSettings,
} from "@/lib/commission/actions";

export function EmployeeCommissionSettingsForm({
  profileId,
  commissionEligible,
  notes,
}: {
  profileId: string;
  commissionEligible: boolean;
  notes: string | null;
}) {
  const [state, formAction] = useActionState(
    saveEmployeeCommissionSettings,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <CheckboxField
        label="Commission eligible"
        name="commissionEligible"
        defaultChecked={commissionEligible}
        hint="Eligibility alone does not set a rate — the plan assignment below does."
      />
      <Field label="Notes" htmlFor={`settings-notes-${profileId}`}>
        <TextInput
          id={`settings-notes-${profileId}`}
          name="notes"
          defaultValue={notes ?? ""}
          placeholder="Optional context for this decision."
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save eligibility" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function EmployeeCommissionAssignmentForm({
  profileId,
  plans,
  defaultEffectiveFrom,
}: {
  profileId: string;
  plans: { id: string; name: string }[];
  defaultEffectiveFrom: string;
}) {
  const [state, formAction] = useActionState(
    createEmployeeCommissionAssignment,
    undefined,
  );

  if (plans.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Create a commission plan before assigning one to this employee.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="profileId" value={profileId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Commission plan"
          htmlFor={`assignment-plan-${profileId}`}
          error={fieldError(state, "commissionPlanId")}
        >
          <Select
            id={`assignment-plan-${profileId}`}
            name="commissionPlanId"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Select a plan
            </option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Effective from"
          htmlFor={`assignment-from-${profileId}`}
          error={fieldError(state, "effectiveFrom")}
        >
          <TextInput
            id={`assignment-from-${profileId}`}
            name="effectiveFrom"
            type="date"
            defaultValue={defaultEffectiveFrom}
            required
          />
        </Field>
        <Field
          label="Effective to"
          htmlFor={`assignment-to-${profileId}`}
          hint="Blank = open-ended."
          error={fieldError(state, "effectiveTo")}
        >
          <TextInput id={`assignment-to-${profileId}`} name="effectiveTo" type="date" />
        </Field>
        <Field label="Notes" htmlFor={`assignment-notes-${profileId}`}>
          <TextInput
            id={`assignment-notes-${profileId}`}
            name="notes"
            placeholder="Optional"
          />
        </Field>
      </div>
      <p className="text-xs leading-5 text-ink-subtle">
        If an earlier assignment covers this start date, it is closed the day before the
        new one begins so the employee&apos;s plan history is preserved.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Save assignment" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
