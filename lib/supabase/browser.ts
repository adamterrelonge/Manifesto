import { createClient } from "@supabase/supabase-js";

// Singleton — Next.js re-renders the client component on every route
// navigation; we don't want a new Supabase instance each time.
let _client: ReturnType<typeof createClient> | null = null;

export function createBrowserClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — " +
        "add these to .env.local alongside the existing server-side SUPABASE_* vars"
    );
  }

  _client = createClient(url, anonKey);
  return _client;
}
