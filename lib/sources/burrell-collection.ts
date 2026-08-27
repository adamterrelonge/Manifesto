import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Same Glasgow Life `whats-on?venue=X` listing as lib/sources/kelvingrove.ts.
// The venue filter needs the "The" prefix — `venue=Burrell+Collection`
// (without "The") returns 0 results even though the site's own display name
// drops it in the card text. Confirmed live: 12 events, all correctly
// tagged "The Burrell Collection" in their second `.card__meta`.

const BASE_URL = "https://www.glasgowlife.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on?venue=The+Burrell+Collection&channel=All`;

const VENUE = {
  name: "The Burrell Collection",
  address: "2060 Pollokshaws Road",
  city: "Glasgow",
  region: "Glasgow City",
  postcode: "G43 1AT",
  lat: 55.823776,
  lng: -4.303952,
};

export interface BurrellCollectionRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// Same date-text shapes as Kelvingrove's parser — including messier
// live variants like "Every week on Saturday from 22nd Nov 2025 - 20th Dec
// 2026 until 20th Dec 2026", where the from/until regex still isolates a
// usable start (first date found in the "from" segment) and end.
function parseBurrellDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1").replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const fromUntil = clean.match(/from\s+(.+?)\s+until\s+(.+)$/i);
  if (fromUntil) {
    const start = parseDMY(fromUntil[1]);
    const end = parseDMY(fromUntil[2]);
    return {
      startAt: start ? start.toISOString() : null,
      endAt: end ? end.toISOString() : null,
    };
  }

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*[–—-]\s*/);

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[parts.length - 1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

// Same `article.card` / `.card__title` / `.card__link` / `.card__meta` /
// `.card__img` markup as Kelvingrove.
function parseListingPage(html: string): BurrellCollectionRawEvent[] {
  const $ = cheerio.load(html);
  const events: BurrellCollectionRawEvent[] = [];
  const seen = new Set<string>();

  $("article.card").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find("h2.card__title a.card__link").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".card__meta").first().text();
    const { startAt, endAt } = parseBurrellDateRange(dateText);
    if (!startAt) return;

    const imageUrl = $card.find("img.card__img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({
      slug,
      title,
      description: null,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchBurrellCollectionEvents(): Promise<BurrellCollectionRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Burrell Collection listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

// The shared keyword inferCategory() (lib/categories.ts) maps "guided tour"
// to workshop-talk, but a bare "Tours" title (e.g. "LGBTQ+ Tours at the
// Burrell Collection") doesn't match that phrase and would otherwise stay
// uncategorised. Scoped to this source rather than the shared inference
// rules — a museum tour here is a tour of the permanent collection, so
// gallery-exhibition fits; a bare "tour" isn't safe to infer globally
// (e.g. a band's concert "tour").
function inferBurrellCategory(title: string): Category | null {
  return /\btours?\b/i.test(title) ? "gallery-exhibition" : null;
}

export function normaliseBurrellCollectionEvent(raw: BurrellCollectionRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Burrell Collection event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "The Burrell Collection",
      sourceType: "burrell-collection",
      profileUrl: LISTING_URL,
    },
    category: inferBurrellCategory(raw.title),
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "burrell-collection", id: raw.slug, url: raw.url },
  };
}
