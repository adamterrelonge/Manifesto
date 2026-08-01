import AppShell from "@/app/components/AppShell";
import { createPublicClient } from "@/lib/supabase/server";
import type { EventListItem } from "@/lib/types";
import { NON_QUALIFYING_BUCKETS, HIGH_CONFIDENCE_THRESHOLD, type BucketSlug } from "@/lib/buckets";
import { QUALITY_THRESHOLD } from "@/lib/quality";

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

  // event_buckets!inner is a first-pass gate: it excludes events with zero
  // bucket matches at all. The JS filter below is the real "niche events
  // only" gate — an event needs at least one bucket match that is (a) not
  // in NON_QUALIFYING_BUCKETS (free-entry/low-income-access describe cost,
  // not identity), and (b) either high-confidence or moderator-approved.
  // A low-confidence keyword guess alone never makes an event public —
  // it sits in the admin review queue until a moderator approves it or a
  // stronger match arrives. See docs/PROJECT_PLAN.md §9.
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, start_at, end_at, category, is_free, price_min, currency, source_url, image_url, venues(name, city, region, lat, lng), event_buckets!inner(confidence, assigned_by, buckets(slug, label))"
    )
    .eq("status", "published")
    .eq("is_duplicate", false)
    .gte("quality_score", QUALITY_THRESHOLD) // also excludes unscored (null) rows
    .lt("start_at", horizon.toISOString())
    // A plain "starts within the window" check only works for one-off
    // events. Multi-day/month exhibitions (e.g. Barbican's) started long
    // before "now" but are still running — they need their end_at checked
    // against "now" instead. Point-in-time events with no end_at fall back
    // to the original start_at >= now rule so already-finished ones don't
    // linger forever.
    .or(`end_at.gte.${now.toISOString()},and(end_at.is.null,start_at.gte.${now.toISOString()})`)
    .order("start_at", { ascending: true })
    .limit(1000)
    .returns<EventListItem[]>();

  const events = (data ?? []).filter((event) =>
    event.event_buckets.some(
      (eb) =>
        eb.buckets &&
        !NON_QUALIFYING_BUCKETS.includes(eb.buckets.slug as BucketSlug) &&
        (eb.confidence >= HIGH_CONFIDENCE_THRESHOLD || eb.assigned_by === "moderator")
    )
  );

  return <AppShell events={events} error={error?.message ?? null} />;
}
