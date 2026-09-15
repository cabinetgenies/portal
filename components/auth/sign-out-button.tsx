"use client";

import { useFormStatus } from "react-dom";

import { LogOutIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

function SignOutSubmit() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" disabled={pending} aria-busy={pending}>
      {pending ? <SpinnerIcon className="h-4 w-4" /> : <LogOutIcon className="h-4 w-4" />}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

/**
 * The way out of a session that must not be used.
 *
 * The server action is the same one the sidebar uses, and it ends the Supabase
 * session whatever provider started it — a password sign-in and a Google
 * sign-in are one session, so they sign out the same way.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <SignOutSubmit />
    </form>
  );
}
