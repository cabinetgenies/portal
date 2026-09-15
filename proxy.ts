import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_DENIED_ROUTE,
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
  OAUTH_CALLBACK_ROUTE,
} from "@/lib/auth/routes";
import { isSupabaseConfigured } from "@/lib/env";
import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Routes that must be reachable without a session.
 *
 * The OAuth callback is the important one: the browser arrives from Supabase
 * with a code and a PKCE verifier cookie but no session yet, so redirecting it
 * to /login would throw the code away. /access-denied is here because it has to
 * be able to explain a sign-in that produced no access.
 */
const SESSION_FREE_ROUTES = new Set<string>([
  LOGIN_ROUTE,
  OAUTH_CALLBACK_ROUTE,
  ACCESS_DENIED_ROUTE,
]);

/**
 * Optimistic route protection.
 *
 * Next.js Proxy replaces `middleware.ts` in Next.js 16. It runs before a request
 * is rendered and refreshes the Supabase session cookie when the access token
 * has expired.
 *
 * This is a first line of defence only. Every server-side data read and every
 * Server Action re-verifies the session through the data access layer in
 * `lib/auth/dal.ts`, which is where authorization actually belongs.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isLoginRoute = pathname === LOGIN_ROUTE;

  // Without Supabase configuration there is no session to read. Let the request
  // through so the application can render its configuration notice instead of
  // returning an opaque 500 for every route.
  if (!isSupabaseConfigured) {
    return NextResponse.next({ request });
  }

  let session: Awaited<ReturnType<typeof refreshSession>>;

  try {
    session = await refreshSession(request);
  } catch {
    // The Supabase auth server was unreachable. Fall through to the rendered
    // application, which redirects to /login when it cannot verify a session.
    return NextResponse.next({ request });
  }

  const { response, user } = session;

  if (!user && !SESSION_FREE_ROUTES.has(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_ROUTE;
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLoginRoute) {
    // A signed-in visitor belongs in the application. Which part of it is not
    // decided here: /home re-checks the profile and sends an unapproved account
    // on to /access-denied, so this stays a redirect rather than an authorization.
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = DEFAULT_AUTHENTICATED_ROUTE;
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every request except Next.js internals, static assets and the
     * metadata files served from the app directory.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)",
  ],
};
