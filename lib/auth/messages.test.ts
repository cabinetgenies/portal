import assert from "node:assert/strict";
import test from "node:test";

import { messageForAuthError } from "@/lib/auth/messages";

/**
 * The email/password path still answers the way it did.
 *
 * Google is an additional way in, not a replacement: the password form, its
 * error messages and its session handling are unchanged, and these are the
 * messages it produced before the OAuth work started. The one thing that moved
 * is where they live — out of a `"use server"` module, which may only export
 * async functions, into a pure one that can be tested.
 */

test("wrong credentials are not reported as a system failure", () => {
  assert.equal(
    messageForAuthError("Invalid login credentials"),
    "Incorrect email address or password.",
  );
});

test("the remaining auth failures keep their own explanations", () => {
  assert.match(messageForAuthError("Email not confirmed"), /not been confirmed/i);
  assert.match(messageForAuthError("Email rate limit exceeded"), /too many sign-in attempts/i);
  assert.match(messageForAuthError("Too many requests"), /too many sign-in attempts/i);
});

test("an unrecognised failure is honest about being unrecognised", () => {
  const message = messageForAuthError("something new from Supabase");

  assert.match(message, /could not sign you in/i);
  assert.match(message, /administrator/i);
});
