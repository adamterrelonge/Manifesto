import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Brighton & Hove Museums — a 5-venue umbrella (Royal Pavilion & Garden,
// Brighton Museum & Art Gallery, Preston Manor & Gardens, Hove Museum of
// Creativity, Booth Museum of Natural History), all listed on one
// `/whats-on/` page with the venue name given per-card (`.entry-terms`).
// Date text comes in five shapes: a single date, "X to Y Month Year" (same
// year on both sides, sometimes no month on the first side — "13 to 16
// September 2026" — resolved by borrowing the end's month), "X Month to Y
// Month Year" (cross-month same year), "X Month Year to Y Month Year"
// (cross-year), and "X Month Year - ongoing" (real start, open-ended end).

const BASE_URL = "https://brightonmuseums.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/`;

interface VenueInfo {
  name: string;
  address: string;
  city: string;
  region: string;
  postcode: string;
  lat: number;
  lng: number;
}

const VENUES: Record<string, VenueInfo> = {
  "Royal Pavilion & Garden": {
    name: "Royal Pavilion & Garden",
    address: "Royal Pavilion Garden",
    city: "Brighton",
    region: "East Sussex",
    postcode: "BN1 1FN",
    lat: 50.8225,
    lng: -0.1372,
  },
  "Brighton Museum & Art Gallery": {
    name: "Brighton Museum & Art Gallery",
    address: "Pavilion Gardens",
    city: "Brighton",
    region: "East Sussex",
    postcode: "BN1 1FN",
    lat: 50.8228,
    lng: -0.1367,
  },
  "Preston Manor & Gardens": {
    name: "Preston Manor & Gardens",
    address: "Preston Drove",
    city: "Brighton",
    region: "East Sussex",
    postcode: "BN1 6SD",
    lat: 50.8367,
    lng: -0.1435,
  },
  "Hove Museum of Creativity": {
    name: "Hove Museum of Creativity",
    address: "19 New Church Road",
    city: "Hove",
    region: "East Sussex",
    postcode: "BN3 4AB",
    lat: 50.8297,
    lng: -0.1812,
  },
  "Booth Museum of Natural History": {
    name: "Booth Museum of Natural History",
    address: "194 Dyke Road",
    city: "Brighton",
    region: "East Sussex",
    postcode: "BN1 5AA",
    lat: 50.8309,
    lng: -0.156,
  },
};

// Fallback for a venue name this map doesn't recognise (a new venue added
// to the umbrella, or a text tweak) — keeps the event rather than dropping
// it, same "generic venue" approach as other multi-venue adapters.
const DEFAULT_VENUE: VenueInfo = VENUES["Royal Pavilion & Garden"];

export interface RoyalPavilionMuseumsRawEvent {
  slug: string;
  title: string;
  description: string | null;
  venueName: string;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

function parseListingDate(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const ongoingMatch = clean.match(/^(.+?)\s*-\s*ongoing$/i);
  if (ongoingMatch) {
    const start = parseDMY(ongoingMatch[1]);
    return { startAt: start ? start.toISOString() : null, endAt: null };
  }

  const parts = clean.split(/\s+to\s+|\s*[–—-]\s*/i);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const yearMatch = clean.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    let start = parseDMY(parts[0], year);
    const end = parseDMY(last, year);
    if (!start && end) {
      const dayOnly = parts[0].trim().match(/^\d{1,2}$/);
      if (dayOnly) start = new Date(end.getFullYear(), end.getMonth(), parseInt(dayOnly[0], 10));
    }
    if (start) {
      return { startAt: start.toISOString(), endAt: end ? end.toISOString() : null };
    }
  }

  const single = parseDMY(clean);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

function parseListingPage(html: string): RoyalPavilionMuseumsRawEvent[] {
  const $ = cheerio.load(html);
  const events: RoyalPavilionMuseumsRawEvent[] = [];
  const seen = new Set<string>();

  $(".event-archive-card").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".title h3").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".event-dates").first().text().replace(/\s+/g, " ").trim();
    const { startAt, endAt } = parseListingDate(dateText);
    if (!startAt) return;

    const venueName =
      $card.find(".entry-terms").first().text().replace(/\s+/g, " ").trim() || DEFAULT_VENUE.name;
    const description =
      $card.find(".description").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find(".bottom img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      venueName,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchRoyalPavilionMuseumsEvents(): Promise<RoyalPavilionMuseumsRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Royal Pavilion & Museums listing error: ${res.status} ${res.statusText}`);
  }
  return parseListingPage(await res.text());
}

export function normaliseRoyalPavilionMuseumsEvent(
  raw: RoyalPavilionMuseumsRawEvent
): NormalisedEvent {
  const venue = VENUES[raw.venueName] ?? DEFAULT_VENUE;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: {
      name: "Brighton & Hove Museums",
      sourceType: "royal-pavilion-museums",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "royal-pavilion-museums", id: raw.slug, url: raw.url },
  };
}
