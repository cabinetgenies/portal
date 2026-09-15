"use client";

import { useActionState } from "react";

import { AlertIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { signInAction, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState | undefined = undefined;

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={state?.status === "error" ? true : undefined}
          className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
          placeholder="you@cabinetgenies.com"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state?.status === "error" ? true : undefined}
          className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
          placeholder="••••••••"
        />
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state?.status === "error" ? (
          <div className="flex items-start gap-3 rounded-lg border border-line bg-accent-soft px-3 py-2.5">
            <AlertIcon className="mt-0.5 h-4 w-4 text-accent-strong" />
            <p className="text-sm leading-6 text-accent-strong">{state.message}</p>
          </div>
        ) : null}
      </div>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? <SpinnerIcon className="h-4 w-4" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
