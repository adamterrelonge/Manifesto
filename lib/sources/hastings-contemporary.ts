import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Hastings. `/events/` cards (`.single-event`) carry a clean, consistently
// full-year free-text date range in `.event-date` ("13 June 2026 - 13
// September 2026") — no shorthand/no-year cases seen across the listing.
// Category read off `.categories` (a comma-separated list on some cards,
// e.g. "Events, Talks & Tours, Adult Classes" — first term used).

const BASE_URL = "https://www.hastingscontemporary.org";
const LISTING_URL = `${BASE_URL}/events/`;

const VENUE = {
  name: "Hastings Contemporary",
  address: "Rock-a-Nore Road",
  city: "Hastings",
  region: "East Sussex",
  postcode: "TN34 3DW",
  lat: 50.8552,
  lng: 0.593,
};

export interface HastingsContemporaryRawEvent {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
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

function parseListingPage(html: string): HastingsContemporaryRawEvent[] {
  const $ = cheerio.load(html);
  const events: HastingsContemporaryRawEvent[] = [];
  const seen = new Set<string>();

  $("section.single-event").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".event-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".event-date").first().text().replace(/\s+/g, " ").trim();
    const parts = dateText.split(/\s*[–—-]\s*/);
    const start = parseDMY(parts[0]);
    if (!start) return;
    const end = parts.length >= 2 ? parseDMY(parts[parts.length - 1]) : null;

    const categoryText = $card.find(".categories").first().text().replace(/\s+/g, " ").trim();
    const category = categoryText ? categoryText.split(",")[0].trim() || null : null;
    const description =
      $card.find(".event-subtitle").first().text().replace(/\s+/g, " ").trim() ||
      $card.find(".event-intro").first().text().replace(/\s+/g, " ").trim() ||
      null;
    const imageUrl =
      $card.find("img.wp-post-image").first().attr("data-src") ??
      $card.find("img.wp-post-image").first().attr("src") ??
      null;

    events.push({
      slug,
      title,
      description,
      category,
      imageUrl,
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHastingsContemporaryEvents(): Promise<HastingsContemporaryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Hastings Contemporary listing error: ${res.status} ${res.statusText}`);
  }
  return parseListingPage(await res.text());
}

const CATEGORY_MAP: Record<string, string> = {
  Exhibitions: "gallery-exhibition",
  "Talks & Tours": "workshop-talk",
  "Adult Classes": "workshop-talk",
  Children: "family-kids",
  "Young People": "family-kids",
};

export function normaliseHastingsContemporaryEvent(
  raw: HastingsContemporaryRawEvent
): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Hastings Contemporary",
      sourceType: "hastings-contemporary",
      profileUrl: LISTING_URL,
    },
    category: raw.category ? (CATEGORY_MAP[raw.category] ?? null) : null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "hastings-contemporary", id: raw.slug, url: raw.url },
  };
}
