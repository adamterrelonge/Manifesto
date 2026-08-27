import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Same Glasgow Life `whats-on?venue=X` listing as lib/sources/kelvingrove.ts
// — Riverside Museum is just a different `venue=` filter value on the
// identical site. Confirmed live: 4 events, all correctly tagged "Riverside
// Museum" in their second `.card__meta".

const BASE_URL = "https://www.glasgowlife.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on?venue=Riverside+Museum&channel=All`;

const VENUE = {
  name: "Riverside Museum",
  address: "100 Pointhouse Road",
  city: "Glasgow",
  region: "Glasgow City",
  postcode: "G3 8RS",
  lat: 55.864721,
  lng: -4.30743,
};

export interface RiversideMuseumRawEvent {
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

// Same two date-text shapes as Kelvingrove's parser — a one-off run and a
// "from X until Y" recurring window.
function parseRiversideDateRange(text: string): { startAt: string | null; endAt: string | null } {
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
function parseListingPage(html: string): RiversideMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: RiversideMuseumRawEvent[] = [];
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
    const { startAt, endAt } = parseRiversideDateRange(dateText);
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

export async function fetchRiversideMuseumEvents(): Promise<RiversideMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Riverside Museum listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseRiversideMuseumEvent(raw: RiversideMuseumRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Riverside Museum event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Riverside Museum",
      sourceType: "riverside-museum",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "riverside-museum", id: raw.slug, url: raw.url },
  };
}
