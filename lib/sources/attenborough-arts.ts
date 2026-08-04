import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, cheerio } from "./scrape-utils";

// Attenborough Arts Centre (University of Leicester) runs on WordPress with
// The Events Calendar plugin, which exposes a first-party JSON REST API —
// no HTML scraping needed. robots.txt only blocks /wp-admin/, and this
// endpoint returns clean JSON to a plain Node fetch (verified 200, real
// data, no Cloudflare challenge). The default query window (today .. +2y)
// already excludes past events, so no client-side date filtering needed.

const BASE_URL = "https://attenborougharts.com";
const API_URL = `${BASE_URL}/wp-json/tribe/events/v1/events`;
const PER_PAGE = 50;

const DEFAULT_VENUE: NormalisedVenue = {
  name: "Attenborough Arts Centre",
  address: "University of Leicester, Lancaster Road",
  city: "Leicester",
  region: "Leicestershire",
  postcode: "LE1 7HA",
  lat: 52.6253,
  lng: -1.1268,
};

// Coordinates for the handful of venues seen in practice, keyed by postcode.
// Sub-rooms (Gallery 1, Studio 4, Main Hall, Salmon Gallery, Café...) all
// share the main building's postcode. Off-site venues not listed here fall
// back to null lat/lng rather than a guessed position.
const KNOWN_COORDS: Record<string, { lat: number; lng: number }> = {
  "LE1 7HA": { lat: 52.6253, lng: -1.1268 }, // Attenborough Arts Centre, Lancaster Road
  "LE1 5PZ": { lat: 52.6369, lng: -1.1398 }, // Leicester Cathedral (off-site partner event)
};

interface TribeVenue {
  venue?: string;
  address?: string;
  city?: string;
  zip?: string;
}

interface TribeCostDetails {
  values?: string[];
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
  cost?: string;
  cost_details?: TribeCostDetails;
  venue?: TribeVenue;
  image?: TribeImage | false;
}

interface TribeEventsResponse {
  events: TribeEvent[];
  total_pages: number;
}

export interface AttenboroughArtsRawEvent {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  venue: NormalisedVenue;
  url: string;
}

// "2026-08-08 12:00:00" (already UTC) -> ISO string
function toIso(utcDateTime: string | undefined): string | null {
  if (!utcDateTime) return null;
  const d = new Date(utcDateTime.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  const text = cheerio.load(html).text().replace(/\s+/g, " ").trim();
  return text || null;
}

function toVenue(raw: TribeVenue | undefined): NormalisedVenue {
  if (!raw) return DEFAULT_VENUE;
  const coords = raw.zip ? KNOWN_COORDS[raw.zip] : undefined;
  return {
    name: raw.venue ?? DEFAULT_VENUE.name,
    address: raw.address ?? DEFAULT_VENUE.address,
    city: raw.city ?? DEFAULT_VENUE.city,
    region: DEFAULT_VENUE.region,
    postcode: raw.zip ?? DEFAULT_VENUE.postcode,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  };
}

function toPrices(cost: string | undefined, details: TribeCostDetails | undefined): {
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
} {
  const values = (details?.values ?? [])
    .map((v) => parseFloat(v))
    .filter((n) => !isNaN(n));

  const isFree =
    /\bfree\b/i.test(cost ?? "") || (values.length > 0 && values.every((v) => v === 0));

  if (values.length === 0) return { isFree, priceMin: null, priceMax: null };
  return {
    isFree,
    priceMin: Math.min(...values),
    priceMax: Math.max(...values),
  };
}

async function fetchPage(page: number): Promise<TribeEventsResponse> {
  const res = await fetch(`${API_URL}?per_page=${PER_PAGE}&page=${page}`, {
    headers: REQUEST_HEADERS,
  });
  if (!res.ok) throw new Error(`Attenborough Arts events API error: ${res.status}`);
  return res.json() as Promise<TribeEventsResponse>;
}

export async function fetchAttenboroughArtsEvents(): Promise<AttenboroughArtsRawEvent[]> {
  const first = await fetchPage(1);
  const pages = [first.events];

  for (let page = 2; page <= first.total_pages; page++) {
    pages.push((await fetchPage(page)).events);
  }

  return pages.flat().map((e) => {
    const { isFree, priceMin, priceMax } = toPrices(e.cost, e.cost_details);
    const imageUrl = e.image && e.image.url ? e.image.url : null;

    return {
      id: String(e.id),
      title: e.title.replace(/\s+/g, " ").trim(),
      description: stripHtml(e.description),
      imageUrl,
      startAt: toIso(e.utc_start_date),
      endAt: toIso(e.utc_end_date),
      isFree,
      priceMin,
      priceMax,
      venue: toVenue(e.venue),
      url: e.url,
    };
  });
}

export function normaliseAttenboroughArtsEvent(
  raw: AttenboroughArtsRawEvent
): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`Attenborough Arts event ${raw.id} has no start date`);
  }
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: raw.venue,
    organiser: {
      name: "Attenborough Arts Centre",
      sourceType: "attenborough-arts",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: raw.priceMin,
    priceMax: raw.priceMax,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "attenborough-arts", id: raw.id, url: raw.url },
  };
}
