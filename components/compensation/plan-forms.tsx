"use client";

import { useActionState, useState } from "react";

import {
  CheckboxField,
  Field,
  FormAlert,
  Select,
  SubmitButton,
  Textarea,
  TextInput,
  fieldError,
} from "@/components/ui/form";
import {
  saveCompensationPlan,
  saveCompensationPlanVersion,
  saveCompensationTier,
} from "@/lib/compensation/actions";
import {
  PARTICIPANT_KINDS,
  PARTICIPANT_KIND_LABELS,
  PARTICIPANT_KIND_NOTES,
  IMPLEMENTED_PARTICIPANT_KINDS,
  isParticipantKind,
} from "@/lib/compensation/types";

export function CompensationPlanCreateForm() {
  const [state, formAction] = useActionState(saveCompensationPlan, undefined);
  const [participantKind, setParticipantKind] = useState<string>("sales_designer");

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan name" htmlFor="plan-name" error={fieldError(state, "name")}>
          <TextInput
            id="plan-name"
            name="name"
            placeholder="Straight GP — Sales Designers"
            required
            invalid={Boolean(fieldError(state, "name"))}
          />
        </Field>
        <Field
          label="Compensates"
          htmlFor="plan-participant"
          hint="Manager plans are reserved for the phase that implements manager bonuses."
          error={fieldError(state, "participantKind")}
        >
          <Select
            id="plan-participant"
            name="participantKind"
            value={participantKind}
            onChange={(event) => setParticipantKind(event.target.value)}
          >
            {PARTICIPANT_KINDS.map((kind) => (
              <option
                key={kind}
                value={kind}
                disabled={!IMPLEMENTED_PARTICIPANT_KINDS.includes(kind)}
              >
                {PARTICIPANT_KIND_LABELS[kind]}
                {IMPLEMENTED_PARTICIPANT_KINDS.includes(kind) ? "" : " (reserved)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Plan type"
          htmlFor="plan-type"
          hint="More plan types can be added later."
        >
          <Select id="plan-type" name="planType" defaultValue="straight_gp">
            <option value="straight_gp">Straight gross profit (GP bands)</option>
          </Select>
        </Field>
      </div>
      <Field
        label="Description"
        htmlFor="plan-description"
        error={fieldError(state, "description")}
      >
        <Textarea
          id="plan-description"
          name="description"
          rows={2}
          placeholder="What this plan applies to and who approved it."
        />
      </Field>

      {isParticipantKind(participantKind) ? (
        <p className="text-xs leading-5 text-ink-subtle">
          {PARTICIPANT_KIND_NOTES[participantKind]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <CheckboxField label="Active" name="active" defaultChecked />
        <SubmitButton label="Add plan" pendingLabel="Adding…" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function CompensationPlanEditForm({
  plan,
}: {
  plan: {
    id: string;
    name: string;
    description: string | null;
    participant_kind: string;
    plan_type: string;
    active: boolean;
  };
}) {
  const [state, formAction] = useActionState(saveCompensationPlan, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={plan.id} />
      <input type="hidden" name="planType" value={plan.plan_type} />
      <input type="hidden" name="participantKind" value={plan.participant_kind} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan name" htmlFor={`plan-name-${plan.id}`} error={fieldError(state, "name")}>
          <TextInput
            id={`plan-name-${plan.id}`}
            name="name"
            defaultValue={plan.name}
            required
          />
        </Field>
        <Field label="Description" htmlFor={`plan-description-${plan.id}`}>
          <TextInput
            id={`plan-description-${plan.id}`}
            name="description"
            defaultValue={plan.description ?? ""}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <CheckboxField label="Active" name="active" defaultChecked={plan.active} />
        <SubmitButton label="Save plan" pendingLabel="Saving…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function CompensationPlanVersionForm({
  planId,
  suggestedStart,
}: {
  planId: string;
  suggestedStart: string;
}) {
  const [state, formAction] = useActionState(saveCompensationPlanVersion, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="compensationPlanId" value={planId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Version name"
          htmlFor={`version-name-${planId}`}
          error={fieldError(state, "versionName")}
        >
          <TextInput
            id={`version-name-${planId}`}
            name="versionName"
            placeholder="v2"
            required
            invalid={Boolean(fieldError(state, "versionName"))}
          />
        </Field>
        <Field
          label="Effective from"
          htmlFor={`version-from-${planId}`}
          error={fieldError(state, "effectiveFrom")}
        >
          <TextInput
            id={`version-from-${planId}`}
            name="effectiveFrom"
            type="date"
            defaultValue={suggestedStart}
            required
          />
        </Field>
        <Field
          label="Effective to"
          htmlFor={`version-to-${planId}`}
          hint="Leave blank for open-ended."
          error={fieldError(state, "effectiveTo")}
        >
          <TextInput id={`version-to-${planId}`} name="effectiveTo" type="date" />
        </Field>
        <div className="flex items-end pb-1">
          <CheckboxField label="Active" name="active" defaultChecked />
        </div>
      </div>
      <Field label="Notes" htmlFor={`version-notes-${planId}`} error={fieldError(state, "notes")}>
        <Textarea
          id={`version-notes-${planId}`}
          name="notes"
          rows={2}
          placeholder="Why this version exists, and who approved it."
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Add version" pendingLabel="Adding…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}

export function CompensationPlanTierForm({
  versionId,
  suggestedSortOrder,
}: {
  versionId: string;
  suggestedSortOrder: number;
}) {
  const [state, formAction] = useActionState(saveCompensationTier, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="compensationPlanVersionId" value={versionId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Evaluation order"
          htmlFor={`tier-order-${versionId}`}
          hint="1 is evaluated first. Put the highest band first."
          error={fieldError(state, "sortOrder")}
        >
          <TextInput
            id={`tier-order-${versionId}`}
            name="sortOrder"
            type="number"
            step="1"
            min="1"
            defaultValue={suggestedSortOrder}
            required
          />
        </Field>
        <Field
          label="Commission rate (%)"
          htmlFor={`tier-rate-${versionId}`}
          error={fieldError(state, "ratePercent")}
        >
          <TextInput
            id={`tier-rate-${versionId}`}
            name="ratePercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="33"
            required
          />
        </Field>
        <Field label="Label" htmlFor={`tier-label-${versionId}`} error={fieldError(state, "label")}>
          <TextInput
            id={`tier-label-${versionId}`}
            name="label"
            placeholder="At or above the project minimum GP standard"
          />
        </Field>
      </div>

      <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-3 sm:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-ink-subtle uppercase">
            Lower bound
          </p>
          <Field label="Basis" htmlFor={`tier-lower-type-${versionId}`}>
            <Select
              id={`tier-lower-type-${versionId}`}
              name="lowerThresholdType"
              defaultValue="fixed"
            >
              <option value="fixed">Fixed percentage</option>
              <option value="project_minimum">Project minimum GP standard</option>
            </Select>
          </Field>
          <Field
            label="Value"
            htmlFor={`tier-lower-value-${versionId}`}
            hint="Blank = open-ended below."
            error={fieldError(state, "lowerValue")}
          >
            <TextInput
              id={`tier-lower-value-${versionId}`}
              name="lowerValue"
              type="number"
              step="0.01"
              placeholder="15"
            />
          </Field>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.08em] text-ink-subtle uppercase">
            Upper bound
          </p>
          <Field label="Basis" htmlFor={`tier-upper-type-${versionId}`}>
            <Select
              id={`tier-upper-type-${versionId}`}
              name="upperThresholdType"
              defaultValue="fixed"
            >
              <option value="fixed">Fixed percentage</option>
              <option value="project_minimum">Project minimum GP standard</option>
            </Select>
          </Field>
          <Field
            label="Value"
            htmlFor={`tier-upper-value-${versionId}`}
            hint="Blank = open-ended above."
            error={fieldError(state, "upperValue")}
          >
            <TextInput
              id={`tier-upper-value-${versionId}`}
              name="upperValue"
              type="number"
              step="0.01"
              placeholder="25"
            />
          </Field>
        </div>
      </div>

      <p className="text-xs leading-5 text-ink-subtle">
        When the basis is the project minimum GP standard, the value is an offset in
        percentage points from that category&apos;s minimum (0 = exactly the minimum).
        Bands are inclusive on the lower bound and exclusive on the upper bound.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label="Add tier" pendingLabel="Adding…" size="sm" />
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
