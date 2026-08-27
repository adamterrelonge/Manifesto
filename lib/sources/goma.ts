import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Same Glasgow Life `whats-on?venue=X` listing as lib/sources/kelvingrove.ts
// — GoMA is just a different `venue=` filter value on the identical site.
// Confirmed live: 6 events, all correctly tagged "Gallery of Modern Art" in
// their second `.card__meta`.

const BASE_URL = "https://www.glasgowlife.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on?venue=Gallery+of+Modern+Art&channel=All`;

const VENUE = {
  name: "Gallery of Modern Art (GoMA)",
  address: "Royal Exchange Square",
  city: "Glasgow",
  region: "Glasgow City",
  postcode: "G1 3AH",
  lat: 55.859799,
  lng: -4.25247,
};

export interface GomaRawEvent {
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

// Same three date-text shapes as Kelvingrove's parser handles — a one-off
// run, a "from X until Y" recurring window, and (seen live here) a monthly
// "1st Monday" variant ("Every month on the 1st Monday from 1st Jun - 1st
// Sep 2026 until 3rd Aug 2026") that still matches the from/until regex but
// only resolves an approximate start window rather than the true monthly
// cadence — an accepted simplification, same as Kelvingrove's "every week"
// case.
function parseGomaDateRange(text: string): { startAt: string | null; endAt: string | null } {
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
function parseListingPage(html: string): GomaRawEvent[] {
  const $ = cheerio.load(html);
  const events: GomaRawEvent[] = [];
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
    const { startAt, endAt } = parseGomaDateRange(dateText);
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

export async function fetchGomaEvents(): Promise<GomaRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`GoMA listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseGomaEvent(raw: GomaRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`GoMA event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Gallery of Modern Art (GoMA)", sourceType: "goma", profileUrl: LISTING_URL },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "goma", id: raw.slug, url: raw.url },
  };
}
