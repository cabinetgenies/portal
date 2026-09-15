/**
 * The authentication routes, in one place.
 *
 * Kept free of imports so every auth module — the data access layer, the
 * redirect guards, the OAuth helpers and their tests — can share the same paths
 * without pulling a request-scoped client (or React) into the module graph.
 */

export const LOGIN_ROUTE = "/login";

/** Where a signed-in person lands when they are not going somewhere specific. */
export const DEFAULT_AUTHENTICATED_ROUTE = "/home";

/**
 * Where an authenticated but unauthorized person is sent.
 *
 * Reaching the app with a working Supabase session is only half of access: the
 * profile has to exist and be active. This route is the honest answer when it is
 * not, and it is deliberately outside the authenticated shell so it cannot
 * render portal data.
 */
export const ACCESS_DENIED_ROUTE = "/access-denied";

/** Supabase sends the browser back here after the Google round trip. */
export const OAUTH_CALLBACK_ROUTE = "/auth/callback";
