import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { requireSupabaseEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session for an incoming request and returns the
 * response that carries any updated auth cookies.
 *
 * Called from `proxy.ts`. Verifying the user here keeps access tokens fresh
 * across server-rendered navigations; the returned response must be forwarded
 * (or its cookies copied) or the refreshed session is lost.
 */
export async function refreshSession(request: NextRequest) {
  const { url, anonKey } = requireSupabaseEnv();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }

        // Auth responses must never be cached by a CDN or reverse proxy.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Also refreshes the session when the access token has expired.
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return { response, user: null };
  }

  return { response, user: data.user };
}
