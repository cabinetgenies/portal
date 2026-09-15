"use client";

import { useActionState, useState } from "react";

import { ActionButtonForm } from "@/components/ui/action-button-form";
import { Field, FormAlert, Select, SubmitButton, fieldError } from "@/components/ui/form";
import {
  assignJobCommissionPlan,
  attachPlanEffectiveOnSoldDate,
} from "@/lib/commission/actions";

export type PlanOption = {
  id: string;
  name: string;
  active: boolean;
  versions: {
    id: string;
    versionName: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
};

/**
 * Manual commission plan attachment, plus the explicit "use the version that was
 * effective on the sold date" action.
 *
 * Nothing here changes a sold job's plan automatically: the snapshot action is a
 * deliberate administrator decision, and the database refuses plan changes on a
 * sold job from any other role.
 */
export function JobPlanAssignmentForm({
  jobId,
  plans,
  currentPlanId,
  currentVersionId,
  soldDate,
}: {
  jobId: string;
  plans: PlanOption[];
  currentPlanId: string | null;
  currentVersionId: string | null;
  soldDate: string | null;
}) {
  const [state, formAction] = useActionState(assignJobCommissionPlan, undefined);
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const versions = selectedPlan?.versions ?? [];

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="jobId" value={jobId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Commission plan"
            htmlFor={`job-plan-${jobId}`}
            error={fieldError(state, "commissionPlanId")}
          >
            <Select
              id={`job-plan-${jobId}`}
              name="commissionPlanId"
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
            >
              <option value="">No plan attached</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                  {plan.active ? "" : " (inactive)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Plan version"
            htmlFor={`job-plan-version-${jobId}`}
            hint="Versions are effective-dated and are never re-resolved for a sold job."
            error={fieldError(state, "commissionPlanVersionId")}
          >
            <Select
              id={`job-plan-version-${jobId}`}
              name="commissionPlanVersionId"
              defaultValue={currentVersionId ?? ""}
              key={planId}
            >
              <option value="">No version attached</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.versionName} ({version.effectiveFrom} →{" "}
                  {version.effectiveTo ?? "open"})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton label="Save commission plan" pendingLabel="Saving…" size="sm" />
          <FormAlert state={state} className="flex-1" />
        </div>
      </form>

      <div className="flex flex-wrap items-start gap-3 border-t border-line pt-4">
        <ActionButtonForm
          action={attachPlanEffectiveOnSoldDate}
          fields={{ jobId }}
          label="Attach version effective on sold date"
          pendingLabel="Resolving…"
        />
        <p className="max-w-xl text-xs leading-5 text-ink-subtle">
          {soldDate
            ? `Resolves the sales designer's commission plan on ${soldDate} and attaches the version that covered that date.`
            : "Set a sold date first — this action snaps to the version that covered the sale."}
        </p>
      </div>
    </div>
  );
}
