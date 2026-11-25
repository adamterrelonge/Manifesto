import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import type { EventListItem } from "@/lib/types";
import { passesPublicGate, publicWindow } from "@/lib/public-gate";
import { QUALITY_THRESHOLD } from "@/lib/quality";

export interface QualifyingEventsResult {
  events: EventListItem[];
  error: string | null;
}

// Every mutating route that can change which events qualify (ingest and its
// standalone dedup/classify/quality/expire stages, plus admin bucket
// approve/reject) calls revalidateTag(QUALIFYING_EVENTS_CACHE_TAG) once its
// write succeeds, so a fresh publish/approval shows up immediately instead
// of waiting out the revalidate window below.
export const QUALIFYING_EVENTS_CACHE_TAG = "qualifying-events";

// The same "published, quality-scored, within the next 8 days, bucket-gated"
// query app/page.tsx has always run — extracted so the city/region SEO
// pages (app/events/**) share the exact bucket-gating logic instead of
// re-implementing it slightly differently. This is the core product
// invariant from docs/PROJECT_PLAN.md §9 ("bucket-tagging is a gate, not a
// filter") — it must never drift between call sites.
//
// Wrapped in unstable_cache (60s) because six routes — the home page,
// /events, /events/city/*, /events/region/*, and the sitemap — independently
// call this, each re-running the full join against Supabase on every
// request with no sharing between them. That's the main reason the site
// felt slow even on localhost: load latency was dominated by waiting on the
// remote DB, not Next.js rendering. This doesn't change page-level
// rendering (app/page.tsx stays force-dynamic) — only the query result is
// memoized, and revalidateTag calls on the mutating routes push fresh data
// out immediately when it actually changes.
export const fetchQualifyingEvents = unstable_cache(
  fetchQualifyingEventsUncached,
  ["qualifying-events"],
  { tags: [QUALIFYING_EVENTS_CACHE_TAG], revalidate: 60 }
);

async function fetchQualifyingEventsUncached(): Promise<QualifyingEventsResult> {
  const supabase = createPublicClient();

  // Bounded by date range, not just row count: the sidebar's widest filter
  // is "This Week" (7 days out), so a flat .limit() ordered by start_at can
  // get entirely consumed by a busy "today" and starve every later day.
  // +8 days gives the client-side week filter (which computes "now" a
  // moment later, in the browser) a little headroom.
  // (8 days — see PUBLIC_WINDOW_DAYS in lib/public-gate.ts.)
  const { horizonIso, liveFilter } = publicWindow();

  // event_buckets!inner is a first-pass gate: it excludes events with zero
  // bucket matches at all. passesPublicGate (lib/public-gate.ts) below is
  // the real gate (community-scale + qualifying bucket) — shared with the source-health
  // yield count so the report matches what users see.
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, start_at, end_at, category, scale, is_free, price_min, currency, source_url, image_url, venues(id, name, city, region, lat, lng), event_buckets!inner(confidence, assigned_by, bucket_id, buckets(slug, label))"
    )
    .eq("status", "published")
    .eq("is_duplicate", false)
    .gte("quality_score", QUALITY_THRESHOLD) // also excludes unscored (null) rows
    .lt("start_at", horizonIso)
    // Running exhibitions qualify via end_at; see publicWindow.
    .or(liveFilter)
    .order("start_at", { ascending: true })
    .limit(1000)
    .returns<EventListItem[]>();

  const events = (data ?? []).filter((event) => passesPublicGate(event));

  return { events, error: error?.message ?? null };
}
