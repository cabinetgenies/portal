/**
 * How a Supabase Auth failure is explained to the person signing in.
 *
 * Supabase's own messages are accurate but not written for the portal's users
 * ("Invalid login credentials"), so they are translated here — in one pure
 * function that the email/password path and its tests can both reach. It lives
 * outside the `"use server"` module because a Server Action file may only export
 * async functions.
 */

const INVALID_CREDENTIALS_MESSAGE = "Incorrect email address or password.";

export function messageForAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return INVALID_CREDENTIALS_MESSAGE;
  }

  if (normalized.includes("email not confirmed")) {
    return "This account has not been confirmed yet. Ask an administrator to confirm it in Supabase.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many sign-in attempts. Wait a moment and try again.";
  }

  return "We could not sign you in. Try again, and contact an administrator if it keeps happening.";
}
