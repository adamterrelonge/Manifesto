import AppShell from "@/app/components/AppShell";
import { createPublicClient } from "@/lib/supabase/server";
import type { EventListItem } from "@/lib/types";

// Live DB query — don't let this get prerendered/frozen at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createPublicClient();

  // Bounded by date range, not just row count: the sidebar's widest filter
  // is "This Week" (7 days out), so a flat .limit() ordered by start_at can
  // get entirely consumed by a busy "today" and starve every later day.
  // +8 days gives the client-side week filter (which computes "now" a
  // moment later, in the browser) a little headroom.
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 8);

  const { data: events, error } = await supabase
    .from("events")
    .select(
      "id, title, description, start_at, category, is_free, price_min, currency, source_url, image_url, venues(name, city, region, lat, lng)"
    )
    .eq("status", "published")
    .eq("is_duplicate", false)
    .gte("start_at", now.toISOString())
    .lt("start_at", horizon.toISOString())
    .order("start_at", { ascending: true })
    .limit(500)
    .returns<EventListItem[]>();

  return <AppShell events={events ?? []} error={error?.message ?? null} />;
}
