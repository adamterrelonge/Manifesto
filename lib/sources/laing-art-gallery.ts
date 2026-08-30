import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Newcastle. Tyne & Wear Archives & Museums' shared `northeastmuseums.org.uk`
// platform — the same `/whats-on/search/-/-/-/-/-/<venue-id>` listing (venue
// id 242) also serves Hatton Gallery/Great North Museum/Discovery Museum,
// each implemented as its own adapter (lib/sources/hatton-gallery.ts,
// lib/sources/great-north-museum.ts, lib/sources/discovery-museum-newcastle.ts).
// Every card renders twice in the raw HTML (carousel + full grid, same
// pattern as lib/sources/leeds-art-gallery.ts) — deduped by slug below.

const BASE_URL = "https://www.northeastmuseums.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/search/-/-/-/-/-/242`;

const VENUE = {
  name: "Laing Art Gallery",
  address: "New Bridge Street",
  city: "Newcastle upon Tyne",
  region: "Tyne and Wear",
  postcode: "NE1 8AG",
  lat: 54.974,
  lng: -1.6086,
};

export interface LaingArtGalleryRawEvent {
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

// Date text comes in four shapes: a real range ("17 Oct 2026 - 13 Feb
// 2027" or "17 Oct - 1 Nov", no year on the first side), a single day
// ("26 Sep"), a comma-separated list of recurring occurrence dates ("12
// Sep, 10 Oct" — the first is used as a representative single-day start,
// no end), and "Until X" with no start given at all (treated as already
// running — startAt = now — same convention as lib/sources/national-gallery.ts's
// `.exhibition-date` handling). "Permanent" listings are skipped.
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

function parseListingPage(html: string): LaingArtGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: LaingArtGalleryRawEvent[] = [];
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

export async function fetchLaingArtGalleryEvents(): Promise<LaingArtGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Laing Art Gallery listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseLaingArtGalleryEvent(raw: LaingArtGalleryRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Laing Art Gallery", sourceType: "laing-art-gallery", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "laing-art-gallery", id: raw.slug, url: raw.url },
  };
}
