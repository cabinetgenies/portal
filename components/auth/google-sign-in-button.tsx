"use client";

import { useActionState } from "react";

import { AlertIcon, GoogleIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { signInWithGoogleAction, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState | undefined = undefined;

/**
 * "Continue with Google".
 *
 * The destination travels with the form, and it is validated again on the way
 * back through the OAuth callback. The button disables itself while the redirect
 * to Google is being prepared and reports a failure in place rather than
 * navigating away.
 */
export function GoogleSignInButton({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    signInWithGoogleAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next} />

      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        aria-busy={pending}
        className="w-full"
      >
        {pending ? (
          <SpinnerIcon className="h-4 w-4" />
        ) : (
          <GoogleIcon className="h-4 w-4" />
        )}
        {pending ? "Taking you to Google…" : "Continue with Google"}
      </Button>

      <div aria-live="polite" aria-atomic="true">
        {state?.status === "error" ? (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-2.5">
            <AlertIcon className="mt-0.5 h-4 w-4 text-accent-strong" />
            <p className="text-sm leading-6 text-accent-strong">{state.message}</p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
