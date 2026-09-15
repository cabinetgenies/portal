"use server";

import { redirect } from "next/navigation";

import { LOGIN_ROUTE } from "@/lib/auth/dal";
import { safeRedirectTarget } from "@/lib/auth/redirects";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = {
  status: "error";
  message: string;
};

const INVALID_CREDENTIALS_MESSAGE = "Incorrect email address or password.";

function messageForAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (normalized.includes("email not confirmed")) {
    return "This account has not been confirmed yet. Ask an administrator to confirm it in Supabase.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many sign-in attempts. Wait a moment and try again.";
  }

  return "We could not sign you in. Try again, and contact an administrator if it keeps happening.";
}

export async function signInAction(
  _previousState: SignInState | undefined,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedTarget = formData.get("next");
  const redirectTo = safeRedirectTarget(
    typeof requestedTarget === "string" ? requestedTarget : null,
  );

  if (!email || !password) {
    return {
      status: "error",
      message: "Enter your email address and password to continue.",
    };
  }

  if (!isSupabaseConfigured) {
    return {
      status: "error",
      message:
        "Supabase is not configured for this environment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the server.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { status: "error", message: messageForAuthError(error.message) };
  }

  redirect(redirectTo);
}

export async function signOutAction() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect(LOGIN_ROUTE);
}
