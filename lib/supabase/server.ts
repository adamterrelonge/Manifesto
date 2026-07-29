import { createClient } from "@supabase/supabase-js";

/**
 * Anon-key client for public reads (Server Components, route handlers that
 * only read). Respects Row Level Security.
 *
 * No auth/session handling yet — that arrives in Phase 4 alongside accounts,
 * at which point this should move to @supabase/ssr for cookie-based sessions.
 */
export function createPublicClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables"
    );
  }

  return createClient(url, anonKey);
}
