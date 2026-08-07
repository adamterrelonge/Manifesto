// Client-side helpers for the favourites/notification-preferences/location
// surfaces added in supabase/migrations/0014_favourites_and_preferences.sql
// (docs/PROJECT_PLAN.md Phase 5). All reads/writes go straight through the
// browser Supabase client and rely on that migration's own-row RLS policies
// — no API route layer, same pattern the claim form uses for
// organiser_claims.

import { createBrowserClient } from "@/lib/supabase/browser";
import type { EventListItem } from "@/lib/types";
import type { BucketSlug } from "@/lib/buckets";

export interface FavouriteVenue {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ProfileLocation {
  home_lat: number | null;
  home_lng: number | null;
  home_label: string | null;
  travel_radius_km: number | null;
}

export async function fetchFavouriteEventIds(userId: string): Promise<Set<string>> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("event_favourites")
    .select("event_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((row: { event_id: string }) => row.event_id));
}

export async function fetchFavouriteVenueIds(userId: string): Promise<Set<string>> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("venue_favourites")
    .select("venue_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((row: { venue_id: string }) => row.venue_id));
}

export async function setEventFavourited(
  userId: string,
  eventId: string,
  favourited: boolean
): Promise<void> {
  const supabase = createBrowserClient();
  if (favourited) {
    await supabase.from("event_favourites").insert({ user_id: userId, event_id: eventId });
  } else {
    await supabase
      .from("event_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("event_id", eventId);
  }
}

export async function setVenueFavourited(
  userId: string,
  venueId: string,
  favourited: boolean
): Promise<void> {
  const supabase = createBrowserClient();
  if (favourited) {
    await supabase.from("venue_favourites").insert({ user_id: userId, venue_id: venueId });
  } else {
    await supabase
      .from("venue_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("venue_id", venueId);
  }
}

// Same nested select shape as app/page.tsx's events query, so the result
// slots straight into the same card/list/map views. An event a user
// favourited earlier can later fail the public RLS read policy (unpublished,
// expired, etc.) — Supabase just returns `events: null` for that row rather
// than erroring, so we filter those out instead of showing a broken card.
export async function fetchFavouritedEvents(userId: string): Promise<EventListItem[]> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("event_favourites")
    .select(
      "events(id, title, description, start_at, end_at, category, is_free, price_min, currency, source_url, image_url, venues(id, name, city, region, lat, lng), event_buckets(confidence, assigned_by, buckets(slug, label)))"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // supabase-js infers the joined `events` relation as an array without a
  // generated Database type (see lib/supabase/browser.ts's own note on
  // this) even though event_id is a to-one FK — cast past that rather than
  // fight the inferred shape.
  const rows = (data ?? []) as unknown as { events: EventListItem | null }[];
  return rows.map((row) => row.events).filter((event): event is EventListItem => event !== null);
}

export async function fetchFavouritedVenues(userId: string): Promise<FavouriteVenue[]> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("venue_favourites")
    .select("venues(id, name, city, region, lat, lng)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as { venues: FavouriteVenue | null }[];
  return rows.map((row) => row.venues).filter((venue): venue is FavouriteVenue => venue !== null);
}

// buckets.id (uuid, DB primary key) vs BucketSlug (the app's stable string
// vocabulary in lib/buckets.ts) — profile_notification_buckets stores the
// uuid FK, so the Settings panel needs this slug->id map to render/persist
// checkboxes keyed by BucketSlug. Mirrors the same lookup app/api/submit's
// route does server-side for self-tagged buckets.
export async function fetchBucketSlugToId(): Promise<Map<BucketSlug, string>> {
  const supabase = createBrowserClient();
  const { data } = await supabase.from("buckets").select("id, slug");
  const map = new Map<BucketSlug, string>();
  for (const row of (data ?? []) as { id: string; slug: string }[]) {
    map.set(row.slug as BucketSlug, row.id);
  }
  return map;
}

export async function fetchNotificationBucketIds(userId: string): Promise<Set<string>> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("profile_notification_buckets")
    .select("bucket_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((row: { bucket_id: string }) => row.bucket_id));
}

export async function setNotificationBucket(
  userId: string,
  bucketId: string,
  enabled: boolean
): Promise<void> {
  const supabase = createBrowserClient();
  if (enabled) {
    await supabase
      .from("profile_notification_buckets")
      .insert({ user_id: userId, bucket_id: bucketId });
  } else {
    await supabase
      .from("profile_notification_buckets")
      .delete()
      .eq("user_id", userId)
      .eq("bucket_id", bucketId);
  }
}

export async function fetchProfileLocation(userId: string): Promise<ProfileLocation | null> {
  const supabase = createBrowserClient();
  const { data } = await supabase
    .from("profiles")
    .select("home_lat, home_lng, home_label, travel_radius_km")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function updateProfileLocation(
  userId: string,
  patch: Partial<ProfileLocation>
): Promise<void> {
  const supabase = createBrowserClient();
  // upsert, not update: a signed-up user has no profiles row until they
  // first touch Settings — 0001_init.sql never inserts one on signup.
  await supabase.from("profiles").upsert({ id: userId, ...patch }, { onConflict: "id" });
}
