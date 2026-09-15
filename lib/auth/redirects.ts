import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/routes";

/** A stand-in origin, used only to resolve the target the way a browser would. */
const RESOLUTION_BASE = "https://portal.invalid";

/**
 * Accepts only same-origin, absolute-path redirect targets, so a crafted `next`
 * query parameter cannot bounce a freshly signed-in user to another site.
 *
 * The check resolves the value against a stand-in origin rather than scanning it
 * for suspicious characters. The URL parser treats `\` and tab/newline
 * characters as `/`, so `/\evil.example` and `/<tab>/evil.example` are both
 * `//evil.example` — a different site wearing a single leading slash. Resolving
 * catches every such spelling, including ones added to the standard later,
 * because the browser and this function agree on what the value means.
 */
export function safeRedirectTarget(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  const target = value.trim();

  if (!target.startsWith("/")) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  try {
    if (new URL(target, RESOLUTION_BASE).origin !== RESOLUTION_BASE) {
      return DEFAULT_AUTHENTICATED_ROUTE;
    }
  } catch {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  return target;
}
