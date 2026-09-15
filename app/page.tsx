import { redirect } from "next/navigation";

import { getSessionContext } from "@/lib/auth/dal";
import {
  ACCESS_DENIED_ROUTE,
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
} from "@/lib/auth/routes";

/** Session-dependent, so it must be evaluated per request. */
export const dynamic = "force-dynamic";

/**
 * The root route is a router, not a page: signed-in users continue to the
 * dashboard, an authenticated account without an approved profile is told why,
 * and everyone else lands on the sign-in screen.
 */
export default async function RootPage() {
  const session = await getSessionContext();

  if (!session) {
    redirect(LOGIN_ROUTE);
  }

  redirect(
    session.status === "authorized" ? DEFAULT_AUTHENTICATED_ROUTE : ACCESS_DENIED_ROUTE,
  );
}
