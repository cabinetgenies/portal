import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/dal";

/**
 * Accepts only same-origin, absolute-path redirect targets, so a crafted `next`
 * query parameter cannot bounce a freshly signed-in user to another site.
 */
export function safeRedirectTarget(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  return value;
}
