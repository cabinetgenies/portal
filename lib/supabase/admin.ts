import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServiceRoleKey, requireSupabaseEnv } from "@/lib/env";

import type { Database } from "./database.types";

export class ServiceRoleUnavailableError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Privileged server-side administration is unavailable.",
    );
    this.name = "ServiceRoleUnavailableError";
  }
}

/**
 * Privileged, RLS-bypassing Supabase client for server-only administration
 * (for example creating auth users from an admin Server Action in a later
 * phase).
 *
 * This is intentionally NOT required for normal authentication or for reading
 * portal data. It throws unless `SUPABASE_SERVICE_ROLE_KEY` is configured, so a
 * missing key can never silently degrade into untrusted access. Never import
 * this module from a Client Component.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const { url } = requireSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

  if (!serviceRoleKey) {
    throw new ServiceRoleUnavailableError();
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
