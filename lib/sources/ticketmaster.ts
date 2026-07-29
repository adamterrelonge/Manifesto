import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";

// Confirmed against https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
const TICKETMASTER_SEARCH_URL =
  "https://app.ticketmaster.com/discovery/v2/events.json";

const MAX_PAGE_SIZE = 200;

export interface TicketmasterSearchParams {
  countryCode?: string;
  startDateTime?: string; // ISO 8601, e.g. 2024-08-01T00:00:00Z
  endDateTime?: string;
  size?: number;
  page?: number;
}

interface TicketmasterVenue {
  name?: string;
  address?: { line1?: string };
  city?: { name?: string };
  postalCode?: string;
  location?: { latitude?: string; longitude?: string };
}

interface TicketmasterImage {
  url: string;
  ratio?: string;
  width: number;
  height: number;
}

interface TicketmasterEvent {
  id: string;
  name: string;
  info?: string;
  pleaseNote?: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    end?: { localDate?: string; localTime?: string; dateTime?: string };
  };
  images?: TicketmasterImage[];
  priceRanges?: { min?: number; max?: number; currency?: string }[];
  classifications?: {
    segment?: { name?: string };
    genre?: { name?: string };
  }[];
  _embedded?: { venues?: TicketmasterVenue[] };
}

interface TicketmasterSearchResponse {
  _embedded?: { events?: TicketmasterEvent[] };
  page?: { size: number; totalElements: number; totalPages: number; number: number };
}

export async function fetchTicketmasterEvents(
  params: TicketmasterSearchParams = {}
): Promise<TicketmasterEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TICKETMASTER_API_KEY environment variable");
  }

  const url = new URL(TICKETMASTER_SEARCH_URL);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("countryCode", params.countryCode ?? "GB");
  url.searchParams.set("size", String(params.size ?? MAX_PAGE_SIZE));
  url.searchParams.set("page", String(params.page ?? 0));
  if (params.startDateTime)
    url.searchParams.set("startDateTime", params.startDateTime);
  if (params.endDateTime) url.searchParams.set("endDateTime", params.endDateTime);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Ticketmaster API error: ${res.status} ${res.statusText} — ${await res.text()}`
    );
  }

  const data = (await res.json()) as TicketmasterSearchResponse;
  return data._embedded?.events ?? [];
}

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === ("" as unknown)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bestImage(images: TicketmasterImage[] | undefined): string | null {
  if (!images || images.length === 0) return null;
  const widescreen = images.find((img) => img.ratio === "16_9");
  return (widescreen ?? images[0]).url;
}

function resolveStartAt(raw: TicketmasterEvent): string | null {
  const start = raw.dates?.start;
  if (!start) return null;
  if (start.dateTime) return new Date(start.dateTime).toISOString();
  if (start.localDate) {
    const time = start.localTime ?? "00:00:00";
    return new Date(`${start.localDate}T${time}`).toISOString();
  }
  return null;
}

// Genre is checked first (finer-grained) and falls back to segment
// (Ticketmaster's small fixed top-level set: Music, Sports, Arts & Theatre,
// Film, Family, Miscellaneous).
const TICKETMASTER_GENRE_MAP: Record<string, Category> = {
  Theatre: "theatre-performance",
  Dance: "theatre-performance",
  "Fine Art": "gallery-exhibition",
};

const TICKETMASTER_SEGMENT_MAP: Record<string, Category> = {
  Music: "music",
  Sports: "sports",
  Film: "film",
  Family: "family-kids",
};

function normaliseCategory(
  segment: string | undefined,
  genre: string | undefined
): Category | null {
  if (genre && TICKETMASTER_GENRE_MAP[genre]) return TICKETMASTER_GENRE_MAP[genre];
  if (segment && TICKETMASTER_SEGMENT_MAP[segment])
    return TICKETMASTER_SEGMENT_MAP[segment];
  return null;
}

export function normaliseTicketmasterEvent(
  raw: TicketmasterEvent
): NormalisedEvent {
  const startAt = resolveStartAt(raw);
  if (!startAt) {
    throw new Error(`Ticketmaster event ${raw.id} has no start date`);
  }

  const venue = raw._embedded?.venues?.[0];
  const priceRange = raw.priceRanges?.[0];

  return {
    title: raw.name,
    description: raw.info ?? raw.pleaseNote ?? null,
    startAt,
    endAt: raw.dates?.end?.dateTime
      ? new Date(raw.dates.end.dateTime).toISOString()
      : null,
    venue: venue
      ? {
          name: venue.name ?? "Unknown venue",
          address: venue.address?.line1 ?? null,
          city: venue.city?.name ?? null,
          region: null,
          postcode: venue.postalCode ?? null,
          lat: toNumber(venue.location?.latitude),
          lng: toNumber(venue.location?.longitude),
        }
      : null,
    organiser: null,
    category: normaliseCategory(
      raw.classifications?.[0]?.segment?.name,
      raw.classifications?.[0]?.genre?.name
    ),
    isFree: priceRange?.min === 0,
    priceMin: toNumber(priceRange?.min),
    priceMax: toNumber(priceRange?.max),
    currency: priceRange?.currency ?? "GBP",
    imageUrl: bestImage(raw.images),
    source: {
      provider: "ticketmaster",
      id: raw.id,
      url: raw.url ?? null,
    },
  };
}
