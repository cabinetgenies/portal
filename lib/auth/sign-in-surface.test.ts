import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Regression guards for the two requirements that are about what does *not*
 * change: the email/password form stays, and sign-out ends either kind of
 * session. There is no DOM test runner in this repository, so these read the
 * server modules directly and pin the structural facts that would otherwise be
 * easy to lose in a refactor.
 */

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("the sign-in screen offers Google above the existing email/password form", () => {
  const loginPage = source("app/(auth)/login/page.tsx");

  const googleButtonIndex = loginPage.indexOf("<GoogleSignInButton");
  const passwordFormIndex = loginPage.indexOf("<LoginForm");

  assert.notEqual(googleButtonIndex, -1, "the login page must render the Google button");
  assert.notEqual(passwordFormIndex, -1, "the login page must keep the password form");
  assert.ok(
    googleButtonIndex < passwordFormIndex,
    "Continue with Google sits above the email/password fields",
  );
  assert.match(loginPage, /uppercase">\s*or\s*</);
});

test("the password sign-in action is still the one the form posts to", () => {
  const actions = source("lib/auth/actions.ts");
  const loginForm = source("app/(auth)/login/login-form.tsx");

  assert.match(actions, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(loginForm, /signInAction/);
});

test("signing out ends the session whatever provider started it", () => {
  const actions = source("lib/auth/actions.ts");
  const signOut = actions.slice(actions.indexOf("export async function signOutAction"));

  assert.match(signOut, /supabase\.auth\.signOut\(\)/);
  // No provider branch: a Google session and a password session are one session,
  // and the sidebar's sign-out and the denial page's sign-out are the same action.
  assert.equal(/provider|google/i.test(signOut), false);

  assert.match(source("components/auth/sign-out-button.tsx"), /signOutAction/);
  assert.match(source("components/app-shell/user-panel.tsx"), /signOutAction/);
});

test("the Google button does not carry a redirector of its own", () => {
  const button = source("components/auth/google-sign-in-button.tsx");

  // The destination is a validated path passed to the server action, never a URL
  // the browser decides to follow.
  assert.match(button, /name="next"/);
  assert.equal(/window\.location|redirectTo\s*[:=]\s*["'`]https?:/.test(button), false);
});
