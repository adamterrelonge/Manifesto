import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { cheerio, REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// robots.txt is permissive (only /wp-admin/) and /whats-on/ returns a clean
// 200 to Node's fetch. The page mixes exhibitions and events in one grid of
// `.exitem` cards — `.strand` (exhibition category/floor, or "Event"/
// "Regular Event") sometimes sits inside the card's `.exhibitionitem` and
// sometimes as a sibling before it, so `.exitem` (the outer column wrapper)
// is used as the card root rather than `.exhibitionitem` itself.

const BASE_URL = "https://thenewartgallerywalsall.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "The New Art Gallery Walsall",
  address: "Gallery Square",
  city: "Walsall",
  region: "West Midlands",
  postcode: "WS2 8LG",
  lat: 52.5855,
  lng: -1.9859,
};

const STRAND_CATEGORY: Record<string, Category> = {
  "contemporary-exhibitions": "gallery-exhibition",
  "collection-exhibitions": "gallery-exhibition",
};

export interface NewArtGalleryWalsallRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isFree: boolean;
  category: Category | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\/?/, "").replace(/\/$/, "");
}

function imageFromStyle(style: string | undefined): string | null {
  if (!style) return null;
  const m = style.match(/url\(([^)]+)\)/);
  return m ? m[1].replace(/^['"]|['"]$/g, "") : null;
}

// Cards come in two date shapes:
//  - "1 May – 13 September 2026" / "30 May 2026 – 23 May 2027" — a normal
//    exhibition/workshop-series range, no year on the left borrows the
//    right's year, same convention as every other date-range parser in this
//    codebase (see e.g. lib/sources/leeds-art-gallery.ts).
//  - "Thursday 6 August 11:00 – 15:00" — a single drop-in day with a
//    24-hour time range and no year at all. scrape-utils' parseTime/
//    applyTime guess a meridiem when none is given ("assume PM"), which
//    would wrongly push a morning slot like 11:00 into the evening — parsed
//    directly here instead since the source already disambiguates via
//    24-hour format.
//  - Free text with no date at all ("Sundays throughout the year", "Every
//    second Saturday of the month") — no digits to match, falls through to
//    null and the card is skipped, same as recurring-activity cards
//    elsewhere in this codebase (e.g. Cartwright Hall, National Museum of
//    Scotland).
function parseWalsallDate(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const timeRange = clean.match(
    /^(?:[A-Za-z]+\s+)?(\d{1,2}\s+[A-Za-z]+)\s+(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})$/
  );
  if (timeRange) {
    const date = parseDMY(timeRange[1]);
    if (!date) return { startAt: null, endAt: null };
    const start = new Date(date);
    start.setHours(parseInt(timeRange[2], 10), parseInt(timeRange[3], 10), 0, 0);
    const end = new Date(date);
    end.setHours(parseInt(timeRange[4], 10), parseInt(timeRange[5], 10), 0, 0);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*[–—-]\s*/);

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): NewArtGalleryWalsallRawEvent[] {
  const $ = cheerio.load(html);
  const events: NewArtGalleryWalsallRawEvent[] = [];
  const seen = new Set<string>();

  $(".exitem").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find(".footit h3 a[href]").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".artist").first().text();
    const { startAt, endAt } = parseWalsallDate(dateText);
    if (!startAt) return;

    // e.g. class="strand contemporary-exhibitions" — the second token is
    // the machine-readable category, the text content ("Contemporary /
    // Floor 3") is display-only.
    const strandClasses = ($card.find(".strand").first().attr("class") ?? "").split(/\s+/);
    const strand = strandClasses.find((c) => c !== "strand");
    const category = strand ? (STRAND_CATEGORY[strand] ?? null) : null;

    const description =
      $card.find(".footit > a").first().text().replace(/\s+/g, " ").trim() || null;

    const imageUrl = imageFromStyle($card.find(".image").first().attr("style"));

    const priceText = $card.find(".entryprice").first().text().replace(/\s+/g, " ").trim();
    const isFree = /free/i.test(priceText);

    events.push({
      slug,
      title,
      description,
      imageUrl,
      isFree,
      category,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchNewArtGalleryWalsallEvents(): Promise<NewArtGalleryWalsallRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`New Art Gallery Walsall listing error: ${res.status} ${res.statusText}`);
  }
  return parseListingPage(await res.text());
}

export function normaliseNewArtGalleryWalsallEvent(
  raw: NewArtGalleryWalsallRawEvent
): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`New Art Gallery Walsall event ${raw.slug} has no start date`);
  }

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "The New Art Gallery Walsall",
      sourceType: "new-art-gallery-walsall",
      profileUrl: LISTING_URL,
    },
    category: raw.category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "new-art-gallery-walsall", id: raw.slug, url: raw.url },
  };
}
