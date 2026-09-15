import { redirect } from "next/navigation";

import {
  DEFAULT_AUTHENTICATED_ROUTE,
  LOGIN_ROUTE,
  getSessionContext,
} from "@/lib/auth/dal";

/** Session-dependent, so it must be evaluated per request. */
export const dynamic = "force-dynamic";

/**
 * The root route is a router, not a page: signed-in users continue to the
 * dashboard, everyone else lands on the sign-in screen.
 */
export default async function RootPage() {
  const session = await getSessionContext();

  redirect(session ? DEFAULT_AUTHENTICATED_ROUTE : LOGIN_ROUTE);
}
