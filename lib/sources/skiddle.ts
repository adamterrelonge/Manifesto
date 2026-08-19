import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { normaliseUkRegion } from "@/lib/uk-region";

// Request shape confirmed against https://github.com/Skiddle/web-api/wiki/Events-API.
// Response field names below were reverse-engineered from live responses
// (the wiki doesn't publish an example payload) and corrected against a
// real sample fetch — see the [skiddle] debug log in fetchSkiddleEvents.

const SKIDDLE_SEARCH_URL = "https://www.skiddle.com/api/v1/events/search/";

// Central-UK point + large radius as a stand-in for "search the whole UK" in
// one call. Skiddle's radius unit isn't documented either — treat this as a
// starting guess to verify, not a confirmed value.
const DEFAULT_LATITUDE = 52.4862; // Birmingham
const DEFAULT_LONGITUDE = -1.8904;
const DEFAULT_RADIUS = 250;

export interface SkiddleSearchParams {
  latitude?: number;
  longitude?: number;
  radius?: number;
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  limit?: number; // max 100
  offset?: number;
}

interface SkiddleVenue {
  id?: string | number;
  name?: string;
  town?: string;
  address?: string;
  postcode?: string;
  region?: string;
  latitude?: string | number;
  longitude?: string | number;
}

interface SkiddleRawEvent {
  id: string | number;
  eventname: string;
  description?: string;
  date?: string;
  startdate?: string;
  enddate?: string;
  link?: string;
  venue?: SkiddleVenue;
  entryprice?: string;
  ticketpricing?: { minPrice?: number; maxPrice?: number };
  currency?: string;
  largeimageurl?: string;
  mediumimageurl?: string;
  EventCode?: string;
}

interface SkiddleSearchResponse {
  results?: SkiddleRawEvent[];
  totalcount?: string | number;
}

export async function fetchSkiddleEvents(
  params: SkiddleSearchParams = {}
): Promise<SkiddleRawEvent[]> {
  const apiKey = process.env.SKIDDLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SKIDDLE_API_KEY environment variable");
  }

  const url = new URL(SKIDDLE_SEARCH_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set(
    "latitude",
    String(params.latitude ?? DEFAULT_LATITUDE)
  );
  url.searchParams.set(
    "longitude",
    String(params.longitude ?? DEFAULT_LONGITUDE)
  );
  url.searchParams.set("radius", String(params.radius ?? DEFAULT_RADIUS));
  if (params.minDate) url.searchParams.set("minDate", params.minDate);
  if (params.maxDate) url.searchParams.set("maxDate", params.maxDate);
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Skiddle API error: ${res.status} ${res.statusText} — ${await res.text()}`
    );
  }

  const data = (await res.json()) as SkiddleSearchResponse;

  if (process.env.NODE_ENV !== "production" && data.results?.[0]) {
    console.log(
      "[skiddle] sample raw result (verify field names):",
      JSON.stringify(data.results[0], null, 2)
    );
  }

  return data.results ?? [];
}

function toNumber(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Confirmed against a live sample of 75 Skiddle events (see conversation) —
// union of the documented filter codes and what actually appears in
// responses. LGB (LGBTQ+ venues/nights) is deliberately not its own
// category: it's an identity signal for Phase 2's `queer` bucket, not a
// "type of event".
const SKIDDLE_CATEGORY_MAP: Record<string, Category> = {
  LIVE: "music",
  CLUB: "music",
  THEATRE: "theatre-performance",
  EXHIB: "gallery-exhibition",
  ARTS: "gallery-exhibition",
  FEST: "market-fair",
  EXPER: "market-fair",
  CONF: "workshop-talk",
  NET: "workshop-talk",
  BOOKS: "workshop-talk",
  HOBBY: "workshop-talk",
  BARPUB: "community-social",
  RELIG: "community-social",
  FUND: "community-social",
  DATE: "community-social",
  LGB: "community-social",
  SPORT: "sports",
  KIDS: "family-kids",
};

function normaliseCategory(eventCode: string | undefined): Category | null {
  if (!eventCode) return null;
  return SKIDDLE_CATEGORY_MAP[eventCode] ?? null;
}

export function normaliseSkiddleEvent(raw: SkiddleRawEvent): NormalisedEvent {
  const startAt = raw.startdate ?? raw.date;
  if (!startAt) {
    throw new Error(`Skiddle event ${raw.id} has no start date`);
  }

  const entryPrice = toNumber(raw.entryprice);
  const minPrice = raw.ticketpricing?.minPrice ?? entryPrice;
  const maxPrice = raw.ticketpricing?.maxPrice ?? entryPrice;

  return {
    title: raw.eventname,
    description: raw.description ?? null,
    startAt: new Date(startAt).toISOString(),
    endAt: raw.enddate ? new Date(raw.enddate).toISOString() : null,
    venue: raw.venue
      ? {
          name: raw.venue.name ?? "Unknown venue",
          address: raw.venue.address ?? null,
          city: raw.venue.town ?? null,
          region: normaliseUkRegion(raw.venue.region),
          postcode: raw.venue.postcode ?? null,
          lat: toNumber(raw.venue.latitude),
          lng: toNumber(raw.venue.longitude),
        }
      : null,
    organiser: null,
    category: normaliseCategory(raw.EventCode),
    isFree: minPrice === 0,
    priceMin: minPrice,
    priceMax: maxPrice,
    currency: raw.currency ?? "GBP",
    imageUrl: raw.largeimageurl ?? raw.mediumimageurl ?? null,
    source: {
      provider: "skiddle",
      id: String(raw.id),
      url: raw.link ?? null,
    },
  };
}
