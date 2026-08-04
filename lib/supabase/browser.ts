import { createClient } from "@supabase/supabase-js";

// Singleton — Next.js re-renders the client component on every route
// navigation; we don't want a new Supabase instance each time.
//
// No generated Database type exists yet for this project, and without one
// @supabase/supabase-js v2's .insert()/.rpc() overloads resolve to
// never/undefined (only .select() reads stay permissive) — the explicit
// <any> keeps every table/RPC usable from client components until a real
// generated schema type is introduced.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: ReturnType<typeof createClient<any>> | null = null;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _client = createClient<any>(url, anonKey);
  return _client;
}
