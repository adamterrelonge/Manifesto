import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Newcastle University. Same Tyne & Wear Archives & Museums
// `northeastmuseums.org.uk` shared platform as lib/sources/laing-art-gallery.ts
// (see that file's header comment for the full shared-platform note and the
// four date-text shapes handled below) — venue id 241.

const BASE_URL = "https://www.northeastmuseums.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/search/-/-/-/-/-/241`;

const VENUE = {
  name: "Hatton Gallery",
  address: "King's Road, Newcastle University",
  city: "Newcastle upon Tyne",
  region: "Tyne and Wear",
  postcode: "NE1 7RU",
  lat: 54.9807,
  lng: -1.6153,
};

export interface HattonGalleryRawEvent {
  slug: string;
  title: string;
  description: string | null;
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
  if (!clean || /^permanent$/i.test(clean)) return { startAt: null, endAt: null };

  const untilMatch = clean.match(/^Until\s+(.+)$/i);
  if (untilMatch) {
    const end = parseDMY(untilMatch[1]);
    if (!end) return { startAt: null, endAt: null };
    return { startAt: new Date().toISOString(), endAt: end.toISOString() };
  }

  const first = clean.split(",")[0].trim();
  const rangeParts = first.split(/\s*[–—-]\s*/);
  if (rangeParts.length >= 2) {
    const yearMatch = first.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    const start = parseDMY(rangeParts[0], year);
    const end = parseDMY(rangeParts[rangeParts.length - 1], year);
    return {
      startAt: start ? start.toISOString() : null,
      endAt: end ? end.toISOString() : null,
    };
  }

  const single = parseDMY(first);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

function parseListingPage(html: string): HattonGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: HattonGalleryRawEvent[] = [];
  const seen = new Set<string>();

  $(".event-grid-item-event").each((_, el) => {
    const $card = $(el);

    const $link = $card.find("a.col-xs-12").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h3").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".event-grid-date").first().text().replace(/\s+/g, " ").trim();
    const { startAt, endAt } = parseListingDate(dateText);
    if (!startAt) return;

    const description =
      $card.find(".event-grid-summary").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find(".event-image img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHattonGalleryEvents(): Promise<HattonGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Hatton Gallery listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseHattonGalleryEvent(raw: HattonGalleryRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Hatton Gallery", sourceType: "hatton-gallery", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "hatton-gallery", id: raw.slug, url: raw.url },
  };
}
