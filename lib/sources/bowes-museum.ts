import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Barnard Castle, County Durham. `/whats-on/` returns a `403` to curl but a
// clean `200` to Node's `fetch` — the opposite direction of the usual
// Cloudflare false-pass pattern seen elsewhere in this codebase (Royal
// Academy et al block Node, not curl) — verified live, this source is fine
// since Vercel's runtime is Node. Images are lazy-loaded (`data-src`, a
// placeholder base64 SVG in `src`), same pattern family as
// lib/sources/firstsite.ts's WP Rocket lazyload but via `data-src` directly
// rather than a CSS background-image.

const BASE_URL = "https://thebowesmuseum.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "The Bowes Museum",
  address: "Newgate",
  city: "Barnard Castle",
  region: "County Durham",
  postcode: "DL12 8NP",
  lat: 54.5388,
  lng: -1.9224,
};

export interface BowesMuseumRawEvent {
  slug: string;
  title: string;
  eventType: string | null;
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

// Date text comes in five shapes: "Every X until Y" (recurring, no defined
// start — startAt = now, same "Until X" convention as
// lib/sources/national-gallery.ts), a full range ("28 March 2026 - 6
// September 2026"), a comma/&-separated list of occurrence dates (the first
// used as a representative single day), a single date, and a rare
// day-sharing-a-month shorthand ("12 & 13 Sep 2026") where splitting on the
// first token loses the month — falls back to parsing the whole string,
// whose second token ("13 Sep 2026") still matches.
function parseBowesDate(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const untilMatch = clean.match(/until\s+(.+)$/i);
  if (untilMatch) {
    const end = parseDMY(untilMatch[1]);
    if (!end) return { startAt: null, endAt: null };
    return { startAt: new Date().toISOString(), endAt: end.toISOString() };
  }

  const rangeParts = clean.split(/\s*[–—-]\s*/);
  if (rangeParts.length >= 2) {
    const yearMatch = clean.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    const start = parseDMY(rangeParts[0], year);
    const end = parseDMY(rangeParts[rangeParts.length - 1], year);
    if (start) return { startAt: start.toISOString(), endAt: end ? end.toISOString() : null };
  }

  const first = clean.split(/[,&]/)[0].trim();
  const single = parseDMY(first) ?? parseDMY(clean);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

function parseListingPage(html: string): BowesMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: BowesMuseumRawEvent[] = [];
  const seen = new Set<string>();

  $("a.event-card").each((_, el) => {
    const $card = $(el);

    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".event-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".event-date").first().text();
    const { startAt, endAt } = parseBowesDate(dateText);
    if (!startAt) return;

    const eventType = $card.find(".event-type").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl =
      $card.find("img.lazyload").first().attr("data-src") ??
      $card.find("noscript img").first().attr("src") ??
      null;

    events.push({
      slug,
      title,
      eventType,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchBowesMuseumEvents(): Promise<BowesMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Bowes Museum listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseBowesMuseumEvent(raw: BowesMuseumRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.eventType ? `${raw.eventType} at The Bowes Museum` : null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "The Bowes Museum", sourceType: "bowes-museum", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "bowes-museum", id: raw.slug, url: raw.url },
  };
}
