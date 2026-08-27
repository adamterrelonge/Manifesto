import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS } from "./scrape-utils";

// Belfast, Northern Ireland. WordPress + The Events Calendar plugin exposes
// a first-party JSON REST API — no HTML scraping needed, same pattern as
// lib/sources/attenborough-arts.ts. robots.txt only blocks /wp/wp-admin/.
//
// Two fields in the raw payload are unconfigured template placeholders, not
// real data, confirmed by checking a live event's own detail page (its
// JSON-LD embeds the identical bogus values):
//   - `venue` is always the WP Events Calendar's default sample venue
//     ("Venue Name", "Address", country "Brazil") — every event ignores it
//     and falls back to the fixed VENUE const below.
//   - `cost`/`cost_details` is always "£99" with currency code "ISO" (not a
//     real currency) on every single event regardless of type — a free
//     reading circle and a paid workshop both show £99. Never trusted;
//     isFree/priceMin/priceMax are left at conservative defaults instead of
//     read from the API.
// Only 6 events / 1 page at time of writing, all tagged "workshop".

const BASE_URL = "https://goldenthreadgallery.co.uk";
const API_URL = `${BASE_URL}/wp-json/tribe/events/v1/events`;
const PER_PAGE = 50;

const VENUE = {
  name: "Golden Thread Gallery",
  address: "23-29 Queen Street",
  city: "Belfast",
  region: "County Antrim",
  postcode: "BT1 6EA",
  lat: 54.598569,
  lng: -5.933476,
};

const TAG_CATEGORY: Record<string, Category> = {
  workshop: "workshop-talk",
};

interface TribeCategory {
  slug?: string;
}

interface TribeImage {
  url?: string;
}

interface TribeEvent {
  id: number;
  title: string;
  description: string;
  url: string;
  utc_start_date?: string;
  utc_end_date?: string;
  categories?: TribeCategory[];
  image?: TribeImage | false;
}

interface TribeEventsResponse {
  events: TribeEvent[];
  total_pages: number;
}

export interface GoldenThreadGalleryRawEvent {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  tag: string | null;
  url: string;
}

// "2026-08-26 11:00:00" (already UTC) -> ISO string
function toIso(utcDateTime: string | undefined): string | null {
  if (!utcDateTime) return null;
  const d = new Date(utcDateTime.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Titles/excerpts carry numeric HTML entities (&#038; -> &, &#8211; -> –)
// rather than the raw characters.
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, "&");
}

async function fetchPage(page: number): Promise<TribeEventsResponse> {
  const res = await fetch(`${API_URL}?per_page=${PER_PAGE}&page=${page}`, {
    headers: REQUEST_HEADERS,
  });
  if (!res.ok) throw new Error(`Golden Thread Gallery events API error: ${res.status}`);
  return res.json() as Promise<TribeEventsResponse>;
}

export async function fetchGoldenThreadGalleryEvents(): Promise<GoldenThreadGalleryRawEvent[]> {
  const first = await fetchPage(1);
  const pages = [first.events];

  for (let page = 2; page <= first.total_pages; page++) {
    pages.push((await fetchPage(page)).events);
  }

  return pages.flat().map((e) => ({
    id: String(e.id),
    title: decodeEntities(e.title).replace(/\s+/g, " ").trim(),
    description: e.description ? decodeEntities(e.description).trim() || null : null,
    imageUrl: e.image && e.image.url ? e.image.url : null,
    startAt: toIso(e.utc_start_date),
    endAt: toIso(e.utc_end_date),
    tag: e.categories?.[0]?.slug ?? null,
    url: e.url,
  }));
}

export function normaliseGoldenThreadGalleryEvent(
  raw: GoldenThreadGalleryRawEvent
): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`Golden Thread Gallery event ${raw.id} has no start date`);
  }

  const category: Category | null = raw.tag ? TAG_CATEGORY[raw.tag] ?? null : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Golden Thread Gallery",
      sourceType: "golden-thread-gallery",
      profileUrl: BASE_URL,
    },
    category,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "golden-thread-gallery", id: raw.id, url: raw.url },
  };
}
