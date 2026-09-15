import assert from "node:assert/strict";
import test from "node:test";

import { safeRedirectTarget } from "@/lib/auth/redirects";
import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/auth/routes";

/**
 * The `next` parameter is attacker-controlled: it arrives in a URL that anybody
 * can craft, on a page anybody can reach, and it is followed immediately after a
 * successful sign-in. Only same-origin absolute paths may survive it.
 */

test("a legitimate destination is kept", () => {
  assert.equal(safeRedirectTarget("/home"), "/home");
  assert.equal(safeRedirectTarget("/sales/commissions/jobs"), "/sales/commissions/jobs");
  assert.equal(safeRedirectTarget("/reports?range=quarter"), "/reports?range=quarter");
});

test("an absent or empty destination falls back to the dashboard", () => {
  assert.equal(safeRedirectTarget(null), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget(undefined), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget(""), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("   "), DEFAULT_AUTHENTICATED_ROUTE);
});

test("absolute URLs to another site are refused", () => {
  assert.equal(safeRedirectTarget("https://evil.example/login"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("http://evil.example"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("//evil.example"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("//evil.example/home"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("javascript:alert(1)"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("evil.example/home"), DEFAULT_AUTHENTICATED_ROUTE);
});

test("a disguised protocol-relative origin is refused", () => {
  // The URL parser treats "\" and tab/newline characters like "/", so each of
  // these is really "//evil.example" — a different site with one leading slash.
  // They must not survive as redirect targets.
  assert.equal(safeRedirectTarget("/\\evil.example"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("/\t/evil.example"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("/\n/evil.example"), DEFAULT_AUTHENTICATED_ROUTE);
  assert.equal(safeRedirectTarget("\\/evil.example"), DEFAULT_AUTHENTICATED_ROUTE);
});

test("a destination is returned trimmed, so whitespace cannot disguise it", () => {
  assert.equal(safeRedirectTarget("  /sales/commissions  "), "/sales/commissions");
});
