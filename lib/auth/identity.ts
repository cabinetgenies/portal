import type { ProfileRow } from "@/lib/supabase/database.types";

/**
 * Pure display helpers, so the application shell never has to guess how a
 * signed-in user should be named.
 */

function clean(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function profileFullName(profile: ProfileRow | null | undefined) {
  const first = clean(profile?.first_name);
  const last = clean(profile?.last_name);
  const combined = [first, last].filter(Boolean).join(" ");

  return combined.length > 0 ? combined : null;
}

export function displayNameFor(
  profile: ProfileRow | null | undefined,
  fallbackEmail?: string | null,
) {
  const fullName = profileFullName(profile);
  if (fullName) return fullName;

  const display = clean(profile?.display_name);
  if (display) return display;

  const email = clean(profile?.email) ?? clean(fallbackEmail);
  if (email) return email.split("@")[0];

  return "Portal user";
}

/** The short name used in the dashboard greeting. */
export function firstNameFor(
  profile: ProfileRow | null | undefined,
  fallbackEmail?: string | null,
) {
  const first = clean(profile?.first_name);
  if (first) return first;

  return displayNameFor(profile, fallbackEmail).split(" ")[0];
}

export function initialsFor(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
