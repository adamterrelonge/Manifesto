import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// City of Wolverhampton Council's arts/heritage sites (Drupal, "wac_starter"
// component library). `/whats-on` is a server-rendered `event-card` grid
// covering both Wolverhampton Art Gallery and Bantock House, venue given
// per-card (`.wac-event-venue-tag .category-tag__link`). Dates are clean
// "DD Mon YYYY" text, either a single date or a "X – Y" range with a full
// year on both sides — no year-inference ambiguity.

const BASE_URL = "https://www.wolverhamptonart.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUES: Record<string, NormalisedVenue> = {
  "Wolverhampton Art Gallery": {
    name: "Wolverhampton Art Gallery",
    address: "Lichfield Street",
    city: "Wolverhampton",
    region: "West Midlands",
    postcode: "WV1 1DU",
    lat: 52.587,
    lng: -2.1276,
  },
  "Bantock House": {
    name: "Bantock House",
    address: "Bantock Park",
    city: "Wolverhampton",
    region: "West Midlands",
    postcode: "WV3 9LQ",
    lat: 52.5793,
    lng: -2.1547,
  },
};

const DEFAULT_VENUE = VENUES["Wolverhampton Art Gallery"];

export interface WolverhamptonArtGalleryRawEvent {
  slug: string;
  title: string;
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

function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const start = parseDMY(parts[0]);
  const end = parts.length > 1 ? parseDMY(parts[parts.length - 1]) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): WolverhamptonArtGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: WolverhamptonArtGalleryRawEvent[] = [];
  const seen = new Set<string>();

  $("article.event-card").each((_, el) => {
    const $card = $(el);

    const href = $card.find(".event-card__title-area a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".event-card__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".event-card__date-text").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const venueName =
      $card.find(".wac-event-venue-tag .category-tag__link").first().text().trim() ||
      DEFAULT_VENUE.name;

    const imageUrl = $card.find(".event-card__media img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      venueName,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchWolverhamptonArtGalleryEvents(): Promise<WolverhamptonArtGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Wolverhampton Art Gallery listing error: ${res.status} ${res.statusText}`);
  }
  return parseListingPage(await res.text());
}

export function normaliseWolverhamptonArtGalleryEvent(
  raw: WolverhamptonArtGalleryRawEvent
): NormalisedEvent {
  const venue = VENUES[raw.venueName] ?? DEFAULT_VENUE;

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: {
      name: venue.name,
      sourceType: "wolverhampton-art-gallery",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "wolverhampton-art-gallery", id: raw.slug, url: raw.url },
  };
}
