import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalisedEvent, NormalisedOrganiser, NormalisedVenue } from "@/lib/types";

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

async function upsertOrganiser(
  admin: AdminClient,
  organiser: NormalisedOrganiser
): Promise<string | null> {
  // Curated sources (e.g. Eventbrite) reuse the same organiser on every
  // event, so an exact match on source_type + profile_url is enough —
  // no fuzzy matching like upsertVenue needs.
  const { data: existing, error: selectError } = await admin
    .from("organisers")
    .select("id")
    .eq("source_type", organiser.sourceType)
    .eq("profile_url", organiser.profileUrl)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await admin
    .from("organisers")
    .insert({
      name: organiser.name,
      source_type: organiser.sourceType,
      profile_url: organiser.profileUrl,
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
  const organiserId = event.organiser
    ? await upsertOrganiser(admin, event.organiser)
    : null;

  const { error } = await admin.from("events").upsert(
    {
      title: event.title,
      description: event.description,
      start_at: event.startAt,
      end_at: event.endAt,
      venue_id: venueId,
      organiser_id: organiserId,
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
