import { NextResponse, type NextRequest } from "next/server";

import { resolvePortalAccess } from "@/lib/auth/access";
import { getProfileLookup } from "@/lib/auth/dal";
import {
  accessRedirectTarget,
  classifyOAuthError,
  loginRouteWithError,
  parseOAuthCallback,
} from "@/lib/auth/oauth";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The application's half of the Google sign-in round trip.
 *
 *   Google → Supabase → here → exchange the PKCE code for a session → /home
 *
 * This is the same Supabase SSR session the password path produces: the code is
 * exchanged with the request-scoped client, which writes the auth cookies onto
 * the redirect response. There is no second session store and no token kept on
 * the server.
 *
 * Exchanging the code is the end of *authentication*. What happens next is the
 * profile check, and it is the same rule every protected route applies: an
 * inactive or missing profile lands on /access-denied rather than in the portal.
 * A Google sign-in therefore cannot reach a page its profile is not entitled to.
 */

/** Session-dependent, so it is never prerendered. */
export const dynamic = "force-dynamic";

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const callback = parseOAuthCallback({
    code: params.get("code"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
    next: params.get("next"),
  });

  if (callback.status === "error") {
    // The person cancelled, the flow state expired, or the identity is already
    // linked to another account. Say so on the sign-in screen and let them retry.
    return redirectTo(request, loginRouteWithError(callback.errorCode, callback.next));
  }

  if (!isSupabaseConfigured) {
    return redirectTo(request, loginRouteWithError("unavailable", callback.next));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(callback.code);

  if (error) {
    console.error("Supabase rejected the OAuth callback:", error.message);

    return redirectTo(
      request,
      loginRouteWithError(
        classifyOAuthError(error.code, error.message),
        callback.next,
      ),
    );
  }

  // Authenticated. Now the portal decides whether that means access — the OAuth
  // provider's word (or the email domain) is never the authorization.
  const lookup = await getProfileLookup();
  const access = resolvePortalAccess(lookup);

  if (access.status !== "authorized") {
    console.warn(
      `Denied portal access after Google sign-in: ${access.reason} (profile: ${lookup.status}).`,
    );
  }

  return redirectTo(request, accessRedirectTarget({ access, next: callback.next }));
}
