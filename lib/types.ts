// Shared normalised shape every source adapter maps into.
// Mirrors the `events` / `venues` / `organisers` tables in
// supabase/migrations/0001_init.sql — see docs/PROJECT_PLAN.md §8.

export interface NormalisedVenue {
  name: string;
  address: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
}

export interface NormalisedOrganiser {
  name: string;
  sourceType: string;
  profileUrl: string | null;
}

export interface NormalisedEvent {
  title: string;
  description: string | null;
  startAt: string; // ISO 8601
  endAt: string | null;
  venue: NormalisedVenue | null;
  organiser: NormalisedOrganiser | null;
  category: string | null;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  imageUrl: string | null;
  source: {
    provider: string;
    id: string;
    url: string | null;
  };
}

// Shape of a row returned by the `events` list query in app/page.tsx,
// passed down through AppShell into the list/card/map views.
export interface EventListItem {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  category: string | null;
  is_free: boolean;
  price_min: number | null;
  currency: string;
  source_url: string | null;
  image_url: string | null;
  venues: {
    id: string;
    name: string;
    city: string | null;
    region: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  event_buckets: {
    confidence: number;
    assigned_by: string;
    bucket_id: string;
    buckets: { slug: string; label: string } | null;
  }[];
}
