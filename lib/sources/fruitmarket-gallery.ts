import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// Fruitmarket (Edinburgh) runs on WordPress with The Events Calendar
// plugin, exposing the same first-party JSON REST API as Attenborough Arts
// Centre / Golden Thread Gallery — no HTML scraping needed. robots.txt is
// fully permissive (Yoast default, no Disallow). Confirmed live: the
// /exhibitions/ listing page itself just renders these same Tribe Events
// items as Bootstrap cards (`.tribe-events-calendar-list__event-datetime`
// with a `datetime="YYYY-MM-DD"` attribute) — the REST API is the cleaner,
// structured version of the exact same data. Every event returned so far
// has an empty `venue` array (no per-event venue override), so a single
// fixed VENUE is used rather than per-event venue parsing.

const BASE_URL = "https://www.fruitmarket.co.uk";
const API_URL = `${BASE_URL}/wp-json/tribe/events/v1/events`;
const PER_PAGE = 50;

const VENUE = {
  name: "Fruitmarket",
  address: "45 Market Street",
  city: "Edinburgh",
  region: "City of Edinburgh",
  postcode: "EH1 1DF",
  lat: 55.951228,
  lng: -3.189987,
};

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
  image?: TribeImage | false;
}

interface TribeEventsResponse {
  events: TribeEvent[];
  total_pages: number;
}

export interface FruitmarketGalleryRawEvent {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  url: string;
}

// "2026-08-28 16:00:00" (already UTC) -> ISO string
function toIso(utcDateTime: string | undefined): string | null {
  if (!utcDateTime) return null;
  const d = new Date(utcDateTime.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Descriptions are raw WordPress HTML (Word-export markup in practice, lots
// of nested <span> soup) — strip tags with a plain regex rather than
// pulling in cheerio for a file that otherwise needs no HTML parsing.
function stripHtml(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#038;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
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
  if (!res.ok) throw new Error(`Fruitmarket events API error: ${res.status}`);
  return res.json() as Promise<TribeEventsResponse>;
}

export async function fetchFruitmarketGalleryEvents(): Promise<FruitmarketGalleryRawEvent[]> {
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
      url: e.url,
    };
  });
}

export function normaliseFruitmarketGalleryEvent(
  raw: FruitmarketGalleryRawEvent
): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`Fruitmarket event ${raw.id} has no start date`);
  }
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Fruitmarket",
      sourceType: "fruitmarket-gallery",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: raw.priceMin,
    priceMax: raw.priceMax,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "fruitmarket-gallery", id: raw.id, url: raw.url },
  };
}
