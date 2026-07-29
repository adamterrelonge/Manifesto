import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";

type AdminClient = ReturnType<typeof createAdminClient>;

async function upsertVenue(
  admin: AdminClient,
  venue: NormalisedVenue
): Promise<string | null> {
  // Fuzzy cross-source match (same postcode/near-identical coordinates +
  // trigram name similarity) — see find_matching_venue in
  // supabase/migrations/0002_dedup.sql. Falls back to inserting a new venue
  // when nothing matches closely enough.
  const { data: matchedId, error: matchError } = await admin.rpc(
    "find_matching_venue",
    {
      p_name: venue.name,
      p_postcode: venue.postcode,
      p_lat: venue.lat,
      p_lng: venue.lng,
    }
  );
  if (matchError) throw matchError;
  if (matchedId) return matchedId;

  const { data: inserted, error: insertError } = await admin
    .from("venues")
    .insert({
      name: venue.name,
      address: venue.address,
      city: venue.city,
      region: venue.region,
      postcode: venue.postcode,
      lat: venue.lat,
      lng: venue.lng,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

export async function upsertNormalisedEvent(
  admin: AdminClient,
  event: NormalisedEvent
): Promise<void> {
  const venueId = event.venue ? await upsertVenue(admin, event.venue) : null;

  const { error } = await admin.from("events").upsert(
    {
      title: event.title,
      description: event.description,
      start_at: event.startAt,
      end_at: event.endAt,
      venue_id: venueId,
      category: event.category,
      is_free: event.isFree,
      price_min: event.priceMin,
      price_max: event.priceMax,
      currency: event.currency,
      image_url: event.imageUrl,
      source_provider: event.source.provider,
      source_id: event.source.id,
      source_url: event.source.url,
      scraped_at: new Date().toISOString(),
    },
    { onConflict: "source_provider,source_id" }
  );

  if (error) throw error;
}
