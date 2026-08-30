import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Manchester (University of Manchester). Squarespace-built `/events` —
// worth noting since Squarespace blocked two other candidates in this doc's
// history (Doyle Wham, CasildART) for having only blog-post dates; this one
// has real exhibition date ranges in a proper `<time class="summary-
// metadata-item--date">` element, so it's a counter-example, not a
// pattern to assume applies everywhere. Category read off `.summary-
// metadata-item--cats a` (e.g. "EXHIBITION").

const BASE_URL = "https://www.museum.manchester.ac.uk";
const LISTING_URL = `${BASE_URL}/events`;

const VENUE = {
  name: "Manchester Museum",
  address: "Oxford Road",
  city: "Manchester",
  region: "Greater Manchester",
  postcode: "M13 9PL",
  lat: 53.4668,
  lng: -2.2339,
};

export interface ManchesterMuseumRawEvent {
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

function parseListingPage(html: string): ManchesterMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: ManchesterMuseumRawEvent[] = [];
  const seen = new Set<string>();

  $(".summary-item-record-type-event").each((_, el) => {
    const $card = $(el);

    const $link = $card.find(".summary-title-link").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $link.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card
      .find(".summary-metadata-item--date")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const rangeParts = dateText.split(/\s*[–—-]\s*/);
    const yearMatch = dateText.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    const start = parseDMY(rangeParts[0], year);
    if (!start) return;
    const end = rangeParts.length >= 2 ? parseDMY(rangeParts[rangeParts.length - 1], year) : null;

    const category =
      $card.find(".summary-metadata-item--cats a").first().text().replace(/\s+/g, " ").trim() ||
      null;
    const description =
      $card.find(".summary-excerpt").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img.summary-thumbnail-image").first().attr("data-src") ?? null;

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

export async function fetchManchesterMuseumEvents(): Promise<ManchesterMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Manchester Museum listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

const CATEGORY_MAP: Record<string, string> = {
  EXHIBITION: "gallery-exhibition",
  TOUR: "workshop-talk",
  TALK: "workshop-talk",
  WORKSHOP: "workshop-talk",
  FAMILY: "family-kids",
};

export function normaliseManchesterMuseumEvent(raw: ManchesterMuseumRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Manchester Museum",
      sourceType: "manchester-museum",
      profileUrl: LISTING_URL,
    },
    category: raw.category ? (CATEGORY_MAP[raw.category] ?? null) : null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "manchester-museum", id: raw.slug, url: raw.url },
  };
}
