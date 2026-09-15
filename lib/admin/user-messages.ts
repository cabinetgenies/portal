/**
 * Messages shared by the user directory UI and its Server Actions.
 *
 * They live outside the `"use server"` module because that module may only
 * export async functions.
 */

export const SERVICE_ROLE_UNAVAILABLE_TITLE =
  "Creating accounts here needs the server-only Supabase service role key";

export const SERVICE_ROLE_UNAVAILABLE_MESSAGE =
  "This deployment has no SUPABASE_SERVICE_ROLE_KEY, so the portal cannot call the Supabase Auth Admin API. Create the user in Supabase → Authentication → Users first: the sign-up trigger creates their portal profile automatically, and it appears in the directory below ready to configure. If a user already exists in Supabase Auth without a profile row, link them with the form below instead. The key is server-only and is never sent to the browser.";

/**
 * Supabase Auth (GoTrue) messages are written for developers. These are the
 * same failures written for whoever is creating the account.
 */
export function provisioningErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already been registered") ||
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("duplicate")
  ) {
    return "A Supabase Auth user with that email already exists. Link the existing account below, or configure their profile in the directory.";
  }

  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Supabase rate-limited the request. Wait a moment and try again.";
  }

  if (normalized.includes("invalid email") || normalized.includes("email address")) {
    return "Supabase rejected that email address. Check it and try again.";
  }

  if (normalized.includes("password")) {
    return "Supabase rejected that password. Use at least 8 characters and try again.";
  }

  if (normalized.includes("signups not allowed") || normalized.includes("disabled")) {
    return "This Supabase project does not allow creating users this way. Create the account in Supabase → Authentication → Users and then link it below.";
  }

  return "Supabase could not create the account. Check Supabase → Authentication → Users, then try again.";
}
