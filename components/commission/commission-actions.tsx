"use client";

import { useActionState, useState } from "react";

import { SpinnerIcon } from "@/components/icons";
import { ActionButtonForm } from "@/components/ui/action-button-form";
import { Button } from "@/components/ui/button";
import { Field, FormAlert, TextInput } from "@/components/ui/form";
import {
  approveCommissionEvent,
  createDepositCommissionEvent,
  createFinalTrueUpEvent,
  markCommissionEventPaid,
  submitCommissionEvent,
  voidCommissionEvent,
} from "@/lib/commission/events-actions";

/**
 * Commission workflow controls.
 *
 * Every control posts to a Server Action that re-checks the capability and the
 * event's current state, so a stale page or a retried click cannot do the wrong
 * thing (creating a duplicate deposit, double-approving, or touching a paid
 * event).
 */

export function CreateDepositCommissionButton({
  jobId,
  disabled,
  label = "Calculate deposit commission",
}: {
  jobId: string;
  disabled?: boolean;
  label?: string;
}) {
  if (disabled) {
    return null;
  }

  return (
    <ActionButtonForm
      action={createDepositCommissionEvent}
      fields={{ jobId }}
      label={label}
      pendingLabel="Calculating…"
      variant="primary"
      size="sm"
    />
  );
}

export function CreateFinalTrueUpButton({
  jobId,
  disabled,
  label = "Calculate final true-up",
}: {
  jobId: string;
  disabled?: boolean;
  label?: string;
}) {
  if (disabled) {
    return null;
  }

  return (
    <ActionButtonForm
      action={createFinalTrueUpEvent}
      fields={{ jobId }}
      label={label}
      pendingLabel="Calculating…"
      variant="primary"
      size="sm"
    />
  );
}

export function CommissionEventWorkflowActions({
  eventId,
  status,
  canSubmit,
  canApprove,
  canPay,
  canVoid,
}: {
  eventId: string;
  status: string;
  canSubmit: boolean;
  canApprove: boolean;
  canPay: boolean;
  canVoid: boolean;
}) {
  const [voiding, setVoiding] = useState(false);

  return (
    <div className="flex flex-wrap items-start gap-2">
      {canSubmit && status === "calculated" ? (
        <ActionButtonForm
          action={submitCommissionEvent}
          fields={{ eventId }}
          label="Submit for approval"
          pendingLabel="Submitting…"
        />
      ) : null}

      {canApprove && status === "pending_approval" ? (
        <ActionButtonForm
          action={approveCommissionEvent}
          fields={{ eventId }}
          label="Approve"
          pendingLabel="Approving…"
          variant="primary"
        />
      ) : null}

      {canPay && status === "approved" ? (
        <ActionButtonForm
          action={markCommissionEventPaid}
          fields={{ eventId }}
          label="Mark paid"
          pendingLabel="Saving…"
          variant="primary"
        />
      ) : null}

      {canVoid && status !== "paid" && status !== "voided" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setVoiding((current) => !current)}
        >
          {voiding ? "Cancel void" : "Void event"}
        </Button>
      ) : null}

      {voiding ? <VoidCommissionEventForm eventId={eventId} /> : null}
    </div>
  );
}

export function VoidCommissionEventForm({ eventId }: { eventId: string }) {
  const [state, formAction, pending] = useActionState(voidCommissionEvent, undefined);

  return (
    <form action={formAction} className="w-full space-y-3 rounded-lg border border-line bg-surface-muted p-3">
      <input type="hidden" name="eventId" value={eventId} />
      <Field
        label="Reason for voiding"
        htmlFor={`void-reason-${eventId}`}
        hint="Required. The event is kept for audit; any ledger offsets it posted are reversed."
      >
        <TextInput
          id={`void-reason-${eventId}`}
          name="reason"
          placeholder="Duplicate of event already paid on …"
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? <SpinnerIcon className="h-4 w-4" /> : null}
          {pending ? "Voiding…" : "Confirm void"}
        </Button>
        <FormAlert state={state} className="flex-1" />
      </div>
    </form>
  );
}
