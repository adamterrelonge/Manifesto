import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Nottingham Contemporary. `/whats-on/` cards (`a.thumb`, either
// `thumb--exhibition` or `thumb--event`) are server-rendered but every card
// appears twice (a "Featured" section plus the full grid, same duplication
// pattern as lib/sources/leeds-art-gallery.ts) — deduped by slug. Dates
// never carry a year and come as abbreviated-weekday text with assorted
// trailing recurrence/time info after a comma ("Tue 16 Jun – Sun 6 Sep,
// Tuesdays, Thursdays, Saturdays & Sundays, 12.30pm") — only the portion
// before the first comma is parsed. End's year is inferred first and the
// start borrows it (same shared-year fallback as
// lib/sources/leicester-museums.ts) to avoid a start 6+ months in the past
// being bumped a year ahead of its own end date.

const BASE_URL = "https://www.nottinghamcontemporary.org";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "Nottingham Contemporary",
  address: "Weekday Cross",
  city: "Nottingham",
  region: "Nottinghamshire",
  postcode: "NG1 2GB",
  lat: 52.9526,
  lng: -1.1503,
};

export interface NottinghamContemporaryRawEvent {
  slug: string;
  title: string;
  tag: string | null;
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

function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const datePart = raw.split(",")[0].replace(/\s+/g, " ").trim();
  if (!datePart) return { startAt: null, endAt: null };

  if (!/[–—-]/.test(datePart)) {
    const single = parseDMY(datePart);
    return single ? { startAt: single.toISOString(), endAt: null } : { startAt: null, endAt: null };
  }

  const parts = datePart.split(/\s*[–—-]\s*/);
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

function parseListingPage(html: string): NottinghamContemporaryRawEvent[] {
  const $ = cheerio.load(html);
  const events: NottinghamContemporaryRawEvent[] = [];
  const seen = new Set<string>();

  $("a.thumb").each((_, el) => {
    const $card = $(el);

    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".thumb__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".thumb__dates").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const tag = $card.find(".thumb__label").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      tag,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchNottinghamContemporaryEvents(): Promise<NottinghamContemporaryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Nottingham Contemporary listing error: ${res.status} ${res.statusText}`);
  }
  return parseListingPage(await res.text());
}

export function normaliseNottinghamContemporaryEvent(
  raw: NottinghamContemporaryRawEvent
): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.tag ? `${raw.tag} at Nottingham Contemporary` : null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Nottingham Contemporary",
      sourceType: "nottingham-contemporary",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "nottingham-contemporary", id: raw.slug, url: raw.url },
  };
}
