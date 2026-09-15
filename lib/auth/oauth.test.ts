import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_IDENTITY_SCOPES,
  classifyOAuthError,
  googleSignInRequest,
  loginRouteWithError,
  oauthCallbackUrl,
  oauthErrorMessage,
  parseOAuthCallback,
  resolveAppOrigin,
  signInErrorMessage,
} from "@/lib/auth/oauth";
import {
  ACCESS_DENIED_ROUTE,
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
  OAUTH_CALLBACK_ROUTE,
} from "@/lib/auth/routes";

/**
 * The Google sign-in round trip, pinned end to end without a browser.
 *
 * Google → Supabase → /auth/callback → session → profile check → /home
 *
 * Everything the flow decides is a pure function, so these tests are the
 * specification: which provider is asked for, where the browser is sent back to,
 * what a cancelled or failed round trip says, and — the part that matters most —
 * the fact that the callback's destination is validated on the way in and again
 * on the way out.
 */

const ORIGIN = "https://portal.cabinetgenies.com";

test("sign-in asks Supabase for the google provider", () => {
  const request = googleSignInRequest({ origin: ORIGIN, next: null });

  assert.equal(request.provider, "google");
  assert.equal(request.options.scopes, GOOGLE_IDENTITY_SCOPES);
});

test("the provider request asks only for identity scopes", () => {
  // No Drive, Gmail or calendar access: the portal authenticates, it does not
  // read anybody's Google data, so no token is worth storing.
  const scopes = GOOGLE_IDENTITY_SCOPES.split(/\s+/);

  assert.deepEqual(scopes, ["email", "profile"]);
  assert.equal(
    /drive|gmail|calendar|contacts|sheets|mail\.google/i.test(GOOGLE_IDENTITY_SCOPES),
    false,
  );
});

test("the OAuth redirect returns through the application callback", () => {
  const request = googleSignInRequest({ origin: ORIGIN, next: "/reports" });

  assert.equal(
    request.options.redirectTo,
    `${ORIGIN}${OAUTH_CALLBACK_ROUTE}?next=%2Freports`,
  );
  assert.ok(request.options.redirectTo.startsWith(`${ORIGIN}${OAUTH_CALLBACK_ROUTE}`));
});

test("the callback carries a validated destination, and drops an unsafe one", () => {
  assert.equal(
    oauthCallbackUrl({ origin: ORIGIN, next: "/sales/commissions" }),
    `${ORIGIN}${OAUTH_CALLBACK_ROUTE}?next=%2Fsales%2Fcommissions`,
  );

  // A crafted `next` never reaches the callback URL, let alone the redirect.
  assert.equal(
    oauthCallbackUrl({ origin: ORIGIN, next: "https://evil.example" }),
    `${ORIGIN}${OAUTH_CALLBACK_ROUTE}`,
  );
  assert.equal(
    oauthCallbackUrl({ origin: ORIGIN, next: "//evil.example" }),
    `${ORIGIN}${OAUTH_CALLBACK_ROUTE}`,
  );
});

test("an origin with a trailing slash does not produce a doubled path", () => {
  assert.equal(
    oauthCallbackUrl({ origin: `${ORIGIN}/`, next: null }),
    `${ORIGIN}${OAUTH_CALLBACK_ROUTE}`,
  );
});

test("a configured site URL wins over the request's host header", () => {
  // The host header is attacker-influenced; the deployment's own URL is not.
  assert.equal(
    resolveAppOrigin({
      siteUrl: ORIGIN,
      host: "evil.example",
      forwardedProto: "https",
    }),
    ORIGIN,
  );
});

test("without a configured site URL the request is used, and nothing is invented", () => {
  assert.equal(
    resolveAppOrigin({ host: "localhost:3000" }),
    "http://localhost:3000",
  );
  assert.equal(
    resolveAppOrigin({ host: "portal.cabinetgenies.com", forwardedProto: "https" }),
    "https://portal.cabinetgenies.com",
  );
  assert.equal(
    resolveAppOrigin({ host: "portal.cabinetgenies.com", forwardedProto: "http" }),
    "http://portal.cabinetgenies.com",
  );
  assert.equal(resolveAppOrigin({ siteUrl: "", host: null }), null);
  assert.equal(resolveAppOrigin({ siteUrl: "not-a-url", host: null }), null);
});

test("a callback with a code is exchanged", () => {
  const parsed = parseOAuthCallback({
    code: "8f2f0f8c-0000-4000-8000-000000000000",
    next: "/sales/commissions/jobs",
  });

  assert.deepEqual(parsed, {
    status: "exchange",
    code: "8f2f0f8c-0000-4000-8000-000000000000",
    next: "/sales/commissions/jobs",
  });
});

test("a callback without a code is an error, never a session", () => {
  assert.deepEqual(parseOAuthCallback({ next: "/home" }), {
    status: "error",
    errorCode: "unknown",
    next: DEFAULT_AUTHENTICATED_ROUTE,
  });

  assert.deepEqual(parseOAuthCallback({ code: "   ", next: null }), {
    status: "error",
    errorCode: "unknown",
    next: DEFAULT_AUTHENTICATED_ROUTE,
  });

  // A provider error is reported as an error even if a code came along with it.
  assert.deepEqual(
    parseOAuthCallback({ code: "abc", error: "access_denied" }),
    { status: "error", errorCode: "cancelled", next: DEFAULT_AUTHENTICATED_ROUTE },
  );
});

test("a callback destination is validated before it is used", () => {
  const parsed = parseOAuthCallback({ code: "abc", next: "https://evil.example" });

  assert.equal(parsed.status, "exchange");
  assert.equal(parsed.next, DEFAULT_AUTHENTICATED_ROUTE);
});

test("provider failures are classified into messages people can act on", () => {
  assert.equal(classifyOAuthError("access_denied"), "cancelled");
  assert.equal(classifyOAuthError("server_error", "Identity is already linked"), "account-exists");
  assert.equal(
    classifyOAuthError("server_error", "A user with this email address has already been registered"),
    "account-exists",
  );
  assert.equal(classifyOAuthError("bad_oauth_state"), "expired");
  assert.equal(
    classifyOAuthError("validation_failed", "Code verifier could not be found"),
    "expired",
  );
  assert.equal(
    classifyOAuthError("server_error", "Unsupported provider: provider is not enabled"),
    "unavailable",
  );
  assert.equal(classifyOAuthError("unexpected_failure"), "unknown");
  assert.equal(classifyOAuthError(null, null), "unknown");

  // Every classification reads as a next step, not as a stack trace.
  for (const code of [
    "cancelled",
    "account-exists",
    "expired",
    "unavailable",
    "unknown",
  ] as const) {
    assert.ok(oauthErrorMessage(code).length > 20);
  }
});

test("the sign-in screen only renders errors it recognises", () => {
  assert.equal(signInErrorMessage("cancelled"), oauthErrorMessage("cancelled"));
  assert.equal(signInErrorMessage("account-exists"), oauthErrorMessage("account-exists"));

  // An unknown — or hostile — query parameter is ignored rather than echoed.
  assert.equal(signInErrorMessage("<script>alert(1)</script>"), null);
  assert.equal(signInErrorMessage(""), null);
  assert.equal(signInErrorMessage(null), null);
  assert.equal(signInErrorMessage(undefined), null);
});

test("an error returns to the sign-in screen and keeps the destination", () => {
  assert.equal(loginRouteWithError("cancelled", null), `${LOGIN_ROUTE}?error=cancelled`);
  assert.equal(
    loginRouteWithError("cancelled", "/reports"),
    `${LOGIN_ROUTE}?error=cancelled&next=%2Freports`,
  );
  assert.equal(
    loginRouteWithError("unknown", "https://evil.example"),
    `${LOGIN_ROUTE}?error=unknown`,
  );
});

test("the denial route the callback uses is the authenticated-but-unauthorized screen", () => {
  assert.equal(ACCESS_DENIED_ROUTE, "/access-denied");
  assert.equal(DEFAULT_AUTHENTICATED_ROUTE, "/home");
  assert.equal(LOGIN_ROUTE, "/login");
  assert.equal(OAUTH_CALLBACK_ROUTE, "/auth/callback");
});
