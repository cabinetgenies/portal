/**
 * Single place where the portal reads its Supabase configuration.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time by Next.js, which is why they
 * are read at module scope. Only the anon key is ever read here — the service
 * role key is deliberately kept out of this module so it can never be pulled
 * into a client bundle by accident.
 */

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const supabaseEnv = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
} as const;

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

/**
 * Throws a descriptive error instead of letting the Supabase client fail with a
 * "supabaseUrl is required" message deep inside a request.
 */
export function requireSupabaseEnv() {
  if (!isSupabaseConfigured) {
    throw new SupabaseConfigurationError(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example) and restart the dev server.",
    );
  }

  return supabaseEnv;
}

/**
 * Server-only service role access. Returns `null` when the key is not present so
 * that privileged administration stays strictly optional in Phase 1.
 */
export function getServiceRoleKey() {
  const value = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  return value.length > 0 ? value : null;
}
