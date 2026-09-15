"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Browser Supabase client.
 *
 * Phase 1 authenticates through Server Actions, so this is not used by the
 * login flow. It exists so future client-side features (realtime subscriptions,
 * client-side uploads, password updates) use the same cookie-based session
 * instead of inventing a second auth path.
 *
 * `createBrowserClient` is a singleton, so calling this repeatedly is cheap.
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = requireSupabaseEnv();

  return createBrowserClient<Database>(url, anonKey);
}
