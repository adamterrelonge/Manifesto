import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// V&A's own `/whatson` listing (distinct from `/east`, which
// lib/sources/vam-east.ts already scrapes) is a 2-venue-plus umbrella —
// South Kensington, Young V&A (Bethnal Green), East Museum, East Storehouse,
// Online, Offsite — each card carrying real schema.org `Event` microdata as
// `<meta itemprop>` tags (ISO startDate/endDate, price/currency, a nested
// `location` Place). Only "south-kensington" and "young" are ingested here
// to avoid double-ingesting the East venues vam-east.ts already covers;
// "online"/"offsite"/"no-venue" are skipped for having no fixed address,
// same convention as other adapters (street-level-photoworks etc).

const BASE_URL = "https://www.vam.ac.uk";
const LISTING_URL = `${BASE_URL}/whatson`;

const VENUES: Record<string, NormalisedVenue> = {
  "south-kensington": {
    name: "Victoria and Albert Museum, South Kensington",
    address: "Cromwell Road",
    city: "London",
    region: "Greater London",
    postcode: "SW7 2RL",
    lat: 51.4966,
    lng: -0.1722,
  },
  young: {
    name: "Young V&A",
    address: "Cambridge Heath Road",
    city: "London",
    region: "Greater London",
    postcode: "E2 9PA",
    lat: 51.5294,
    lng: -0.0556,
  },
};

const INCLUDED_VENUE_KEYS = new Set(Object.keys(VENUES));

export interface VamSouthKensingtonRawEvent {
  slug: string;
  title: string;
  description: string | null;
  venueKey: string;
  startAt: string;
  endAt: string | null;
  isFree: boolean;
  price: number | null;
  imageUrl: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

function parseListingPage(html: string): VamSouthKensingtonRawEvent[] {
  const $ = cheerio.load(html);
  const events: VamSouthKensingtonRawEvent[] = [];
  const seen = new Set<string>();

  $("li.b-event-teaser").each((_, el) => {
    const $card = $(el);

    const venueKey = $card.attr("data-wo-venue") ?? "";
    if (!INCLUDED_VENUE_KEYS.has(venueKey)) return;

    const $article = $card.find('article[itemtype="http://schema.org/Event"]').first();
    if (!$article.length) return;

    const href = $card.find("a.b-event-teaser__link").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title =
      $article.find('[itemprop="name"]').first().attr("content")?.trim() ||
      $article.find(".b-event-teaser__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const startAt = $article.find('meta[itemprop="startDate"]').attr("content") ?? "";
    if (!startAt) return;
    const endAt = $article.find('meta[itemprop="endDate"]').attr("content") ?? null;

    const description =
      $article.find('meta[itemprop="description"]').attr("content")?.replace(/\s+/g, " ").trim() ??
      null;

    const priceText = $article.find('[itemprop="price"]').attr("content");
    const price = priceText ? parseFloat(priceText) : null;
    // A handful of festival-day cards leave data-wo-free empty rather than
    // "true"/"false" — a zero price is a reliable free signal either way.
    const isFree = $card.attr("data-wo-free") === "true" || price === 0;

    const imageUrl = $article.find("img.b-event-teaser__media-image").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      venueKey,
      startAt: new Date(startAt).toISOString(),
      endAt: endAt ? new Date(endAt).toISOString() : null,
      isFree,
      price: price !== null && !isNaN(price) ? price : null,
      imageUrl,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchVamSouthKensingtonEvents(): Promise<VamSouthKensingtonRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`V&A whatson listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseVamSouthKensingtonEvent(
  raw: VamSouthKensingtonRawEvent
): NormalisedEvent {
  const venue = VENUES[raw.venueKey];

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: {
      name: "Victoria and Albert Museum",
      sourceType: "vam-south-kensington",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: raw.isFree ? null : raw.price,
    priceMax: raw.isFree ? null : raw.price,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "vam-south-kensington", id: raw.slug, url: raw.url },
  };
}
