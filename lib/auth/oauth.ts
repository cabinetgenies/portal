import type { PortalAccess } from "@/lib/auth/access";
import { safeRedirectTarget } from "@/lib/auth/redirects";
import {
  ACCESS_DENIED_ROUTE,
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
  OAUTH_CALLBACK_ROUTE,
} from "@/lib/auth/routes";

/**
 * Google sign-in, expressed as pure functions.
 *
 * The OAuth flow is four steps, and every one of them is decided here so the
 * Server Action, the route handler and the tests cannot disagree about it:
 *
 *   1. the sign-in action builds the provider request          → googleSignInRequest
 *   2. Google returns to Supabase, Supabase returns to us      → oauthCallbackUrl
 *   3. the callback exchanges the code for a session           → parseOAuthCallback
 *   4. the session is authorized or denied by the profile      → accessRedirectTarget
 *
 * Nothing here reads a Google access token: the portal only ever learns the
 * person's identity, which is all that the `email` and `profile` scopes carry.
 */

export const GOOGLE_PROVIDER = "google";

/** Identity only. No Drive, Gmail or calendar scopes are requested. */
export const GOOGLE_IDENTITY_SCOPES = "email profile";

export type GoogleSignInRequest = {
  provider: typeof GOOGLE_PROVIDER;
  options: {
    /** Where Supabase sends the browser back to: this application's callback. */
    redirectTo: string;
    /** Requested Google scopes, kept to the identity minimum. */
    scopes: string;
  };
};

/**
 * The `redirectTo` Supabase is given.
 *
 * The allow-list in the Supabase dashboard decides whether the value is
 * accepted, so this is an application path rather than a free-form URL, and the
 * post-sign-in destination travels as `next` — validated on the way in and again
 * on the way out.
 */
export function oauthCallbackUrl({
  origin,
  next,
}: {
  origin: string;
  next?: string | null;
}): string {
  const callback = `${trimTrailingSlash(origin)}${OAUTH_CALLBACK_ROUTE}`;
  const target = safeRedirectTarget(next);

  return target === DEFAULT_AUTHENTICATED_ROUTE
    ? callback
    : `${callback}?next=${encodeURIComponent(target)}`;
}

export function googleSignInRequest({
  origin,
  next,
}: {
  origin: string;
  next?: string | null;
}): GoogleSignInRequest {
  return {
    provider: GOOGLE_PROVIDER,
    options: {
      redirectTo: oauthCallbackUrl({ origin, next }),
      scopes: GOOGLE_IDENTITY_SCOPES,
    },
  };
}

// ---------------------------------------------------------------------------
// The application origin
// ---------------------------------------------------------------------------

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * The origin the OAuth callback is built from.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when it is set, because it is configured by the
 * deployment and cannot be influenced by a request. Falling back to the request
 * itself keeps a local `next dev` run working without extra configuration, and
 * Supabase's redirect allow-list is the backstop: an origin that is not listed
 * there is refused.
 */
export function resolveAppOrigin({
  siteUrl,
  host,
  forwardedProto,
}: {
  siteUrl?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
}): string | null {
  const configured = (siteUrl ?? "").trim();

  if (configured.length > 0 && isHttpUrl(configured)) {
    return trimTrailingSlash(configured);
  }

  const requestHost = (host ?? "").trim();

  if (requestHost.length === 0) {
    return null;
  }

  const protocol = forwardedProtoHeader(forwardedProto) ?? (isLoopback(requestHost) ? "http" : "https");

  return `${protocol}://${trimTrailingSlash(requestHost)}`;
}

function forwardedProtoHeader(value: string | null | undefined) {
  const first = (value ?? "").split(",")[0]?.trim().toLowerCase();

  return first === "http" || first === "https" ? first : null;
}

function isLoopback(host: string) {
  const hostname = host.split(":")[0].toLowerCase();

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

// ---------------------------------------------------------------------------
// The callback
// ---------------------------------------------------------------------------

export type OAuthCallbackRequest =
  | { status: "exchange"; code: string; next: string }
  | { status: "error"; errorCode: OAuthErrorCode; next: string };

/**
 * Reads the callback's query parameters.
 *
 * Supabase either hands back a PKCE `code` to exchange, or a provider error —
 * the person cancelled at Google, the flow state expired, the identity is
 * already linked to an account. Both paths carry the validated `next` target
 * through so a failed sign-in can be retried without losing the destination.
 */
export function parseOAuthCallback({
  code,
  error,
  errorDescription,
  next,
}: {
  code?: string | null;
  error?: string | null;
  errorDescription?: string | null;
  next?: string | null;
}): OAuthCallbackRequest {
  const target = safeRedirectTarget(next);
  const trimmedCode = (code ?? "").trim();

  if (trimmedCode.length > 0 && (error ?? "").trim().length === 0) {
    return { status: "exchange", code: trimmedCode, next: target };
  }

  return {
    status: "error",
    errorCode: classifyOAuthError(error, errorDescription),
    next: target,
  };
}

export type OAuthErrorCode =
  | "cancelled"
  | "account-exists"
  | "expired"
  | "unavailable"
  | "unknown";

export function classifyOAuthError(
  rawError?: string | null,
  description?: string | null,
): OAuthErrorCode {
  const text = `${rawError ?? ""} ${description ?? ""}`.toLowerCase();

  if (text.includes("access_denied") || text.includes("cancel")) {
    return "cancelled";
  }

  if (
    text.includes("already") ||
    text.includes("exists") ||
    text.includes("registered") ||
    text.includes("linked")
  ) {
    return "account-exists";
  }

  if (
    text.includes("flow_state") ||
    text.includes("expired") ||
    text.includes("state") ||
    text.includes("verifier")
  ) {
    return "expired";
  }

  if (
    text.includes("not enabled") ||
    text.includes("unsupported provider") ||
    text.includes("provider is not")
  ) {
    return "unavailable";
  }

  return "unknown";
}

const OAUTH_ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  cancelled: "Google sign-in was cancelled. You can try again, or sign in with your email and password.",
  "account-exists":
    "An account already exists for that email address. Sign in with your email and password, or ask an administrator to link Google to your existing account.",
  expired:
    "That Google sign-in link expired or was already used. Start the sign-in again from this page.",
  unavailable:
    "Google sign-in is not available for this deployment yet. Sign in with your email and password, and ask an administrator to finish the setup.",
  unknown:
    "Google could not complete the sign-in. Try again, or sign in with your email and password.",
};

export function oauthErrorMessage(errorCode: OAuthErrorCode): string {
  return OAUTH_ERROR_MESSAGES[errorCode];
}

/** The sign-in screen, carrying an error code back to it. */
export function loginRouteWithError(errorCode: OAuthErrorCode, next?: string | null): string {
  const target = safeRedirectTarget(next);
  const params = new URLSearchParams({ error: errorCode });

  if (target !== DEFAULT_AUTHENTICATED_ROUTE) {
    params.set("next", target);
  }

  return `${LOGIN_ROUTE}?${params.toString()}`;
}

/**
 * Turns the `error` query parameter on the sign-in screen into a message.
 *
 * Only known codes are rendered: anything else the URL happens to carry is
 * ignored rather than echoed into the page.
 */
export function signInErrorMessage(value: string | null | undefined): string | null {
  const code = (value ?? "").trim();

  if (code.length === 0 || !(code in OAUTH_ERROR_MESSAGES)) {
    return null;
  }

  return oauthErrorMessage(code as OAuthErrorCode);
}

/**
 * Where the callback sends the browser once the session exists.
 *
 * An approved profile continues to the page that was requested; a denied one
 * goes to the denial screen. The OAuth round trip never bypasses the profile
 * check that every protected route applies anyway.
 */
export function accessRedirectTarget({
  access,
  next,
}: {
  access: PortalAccess;
  next?: string | null;
}): string {
  if (access.status !== "authorized") {
    return ACCESS_DENIED_ROUTE;
  }

  return safeRedirectTarget(next);
}
