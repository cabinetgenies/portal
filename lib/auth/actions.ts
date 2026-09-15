"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { LOGIN_ROUTE } from "@/lib/auth/routes";
import { messageForAuthError } from "@/lib/auth/messages";
import { googleSignInRequest, resolveAppOrigin } from "@/lib/auth/oauth";
import { safeRedirectTarget } from "@/lib/auth/redirects";
import { isSupabaseConfigured, publicSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = {
  status: "error";
  message: string;
};

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

/**
 * Starts the Google sign-in round trip.
 *
 * The Supabase client is the same request-scoped SSR client the password path
 * uses, so this is the existing PKCE flow with a different provider: the code
 * verifier is written to this browser's cookies here and redeemed at
 * `/auth/callback`. Nothing about the session handling changes, and no Google
 * token is stored — the portal only learns who the person is.
 *
 * Provider configuration (client id, secret, allowed callback URLs) lives in the
 * Supabase dashboard, never in this repository.
 */
export async function signInWithGoogleAction(
  _previousState: SignInState | undefined,
  formData: FormData,
): Promise<SignInState> {
  const requestedTarget = formData.get("next");
  const redirectTo = safeRedirectTarget(
    typeof requestedTarget === "string" ? requestedTarget : null,
  );

  if (!isSupabaseConfigured) {
    return {
      status: "error",
      message:
        "Supabase is not configured for this environment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the server.",
    };
  }

  const requestHeaders = await headers();
  const origin = resolveAppOrigin({
    siteUrl: publicSiteUrl,
    host: requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
  });

  if (!origin) {
    return {
      status: "error",
      message:
        "The portal could not work out its own address, so Google sign-in cannot start. Set NEXT_PUBLIC_SITE_URL and try again.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth(
    googleSignInRequest({ origin, next: redirectTo }),
  );

  if (error || !data.url) {
    console.error("Supabase refused to start Google sign-in:", error?.message);

    return {
      status: "error",
      message:
        "Google sign-in is not available right now. Sign in with your email and password, and ask an administrator to check the Google provider in Supabase.",
    };
  }

  // Out to Google (via Supabase), and back to /auth/callback.
  redirect(data.url);
}

export async function signOutAction() {
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  redirect(LOGIN_ROUTE);
}
