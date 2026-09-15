"use client";

import { useActionState } from "react";

import { SpinnerIcon } from "@/components/icons";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * A form with a single button and hidden fields — used for state toggles such as
 * activating a plan or a plan version. Submitting runs a Server Action that
 * re-checks permissions, and any failure is surfaced next to the button.
 */
export function ActionButtonForm({
  action,
  fields,
  label,
  pendingLabel,
  variant = "secondary",
  size = "sm",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" disabled={pending} variant={variant} size={size}>
        {pending ? <SpinnerIcon className="h-4 w-4" /> : null}
        {pending ? (pendingLabel ?? "Working…") : label}
      </Button>
      {state?.status === "error" ? (
        <span role="alert" className="max-w-64 text-xs leading-5 text-accent-strong">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
