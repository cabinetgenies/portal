"use client";

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";

import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { ActionState } from "@/lib/forms/action-state";

const CONTROL_CLASS =
  "w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:bg-surface-muted disabled:text-ink-muted aria-[invalid=true]:border-accent-strong";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs leading-5 text-ink-subtle">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-xs leading-5 text-accent-strong" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export function TextInput({ className, invalid, ...props }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid ? true : undefined}
      className={cn(CONTROL_CLASS, "h-10", className)}
      {...props}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
};

export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid ? true : undefined}
      className={cn(CONTROL_CLASS, "h-10", className)}
      {...props}
    >
      {children}
    </select>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export function Textarea({ className, invalid, ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid ? true : undefined}
      className={cn(CONTROL_CLASS, "py-2", className)}
      {...props}
    />
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          className="h-4 w-4 rounded border-line-strong text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
        {label}
      </label>
      {hint ? <p className="pl-7 text-xs leading-5 text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
}: {
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      variant={variant}
      size={size}
      className={className}
    >
      {pending ? <SpinnerIcon className="h-4 w-4" /> : null}
      {pending ? (pendingLabel ?? "Saving…") : label}
    </Button>
  );
}

/**
 * Renders the shared action state. Errors are announced politely so screen
 * readers pick up validation failures without a page change.
 */
export function FormAlert({
  state,
  className,
}: {
  state: ActionState;
  className?: string;
}) {
  if (!state) {
    return null;
  }

  const isError = state.status === "error";

  return (
    <div aria-live="polite" aria-atomic="true" className={className}>
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
          isError
            ? "border-line bg-accent-soft text-accent-strong"
            : "border-line bg-surface-muted text-ink-muted",
        )}
      >
        {isError ? <AlertIcon className="mt-0.5 h-4 w-4" /> : null}
        <p className="text-sm leading-6">{state.message}</p>
      </div>
    </div>
  );
}

export function fieldError(state: ActionState, field: string) {
  if (!state || state.status !== "error") {
    return undefined;
  }

  return state.fieldErrors?.[field]?.[0];
}
