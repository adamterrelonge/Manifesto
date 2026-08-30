import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Leicester Museums (city council-run) `/whats-on/` — a small (8-card),
// unpaginated, server-rendered listing covering New Walk Museum & Art
// Gallery and Newarke Houses Museum, venue name given per-card
// (`.event-item--top-text`, blank on at least one card — defaults to New
// Walk Museum). Dates never carry a year ("14 February - 31 December"),
// each side's year independently inferred via parseDMY's own inferYear
// fallback, same as other no-year adapters (kelvingrove.ts etc).

const BASE_URL = "https://leicestermuseums.org";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUES: Record<string, NormalisedVenue> = {
  "leicester museum & art gallery": {
    name: "Leicester Museum & Art Gallery",
    address: "53 New Walk",
    city: "Leicester",
    region: "Leicestershire",
    postcode: "LE1 7EA",
    lat: 52.6335,
    lng: -1.1335,
  },
  "newarke houses": {
    name: "Newarke Houses Museum",
    address: "The Newarke",
    city: "Leicester",
    region: "Leicestershire",
    postcode: "LE2 7BY",
    lat: 52.6293,
    lng: -1.1418,
  },
};

const DEFAULT_VENUE = VENUES["leicester museum & art gallery"];

export interface LeicesterMuseumsRawEvent {
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
  return url.replace(/^\/+|\/+$/g, "") || "home";
}

function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s*-\s*/);
  if (parts.length < 2) return { startAt: null, endAt: null };

  // End's year is inferred first (closer to "now" for an ongoing
  // exhibition), then start borrows it — inferring both sides
  // independently pushed a start date 8 months in the past onto next
  // year, producing start > end for anything that opened earlier this
  // year and runs on into next (spike-island.ts's "shared-year fallback").
  const end = parseDMY(parts[parts.length - 1]);
  let start = parseDMY(parts[0], end?.getFullYear());
  if (start && end && start > end) {
    start = parseDMY(parts[0], end.getFullYear() - 1);
  }

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): LeicesterMuseumsRawEvent[] {
  const $ = cheerio.load(html);
  const events: LeicesterMuseumsRawEvent[] = [];
  const seen = new Set<string>();

  $("article.search-list-grid--item").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h3").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".text p span").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const venueKey = $card.find(".event-item--top-text").first().text().trim().toLowerCase();
    const description =
      $card.find(".search-item--lower-text").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find(".event-highlight img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      venueName: venueKey,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchLeicesterMuseumsEvents(): Promise<LeicesterMuseumsRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Leicester Museums listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseLeicesterMuseumsEvent(raw: LeicesterMuseumsRawEvent): NormalisedEvent {
  const venue = VENUES[raw.venueName] ?? DEFAULT_VENUE;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: { name: "Leicester Museums", sourceType: "leicester-museums", profileUrl: LISTING_URL },
    category: null,
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "leicester-museums", id: raw.slug, url: raw.url },
  };
}
