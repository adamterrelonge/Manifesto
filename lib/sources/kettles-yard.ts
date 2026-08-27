import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Cambridge (University of Cambridge). robots.txt is empty/permissive
// (`Disallow: /admin/*` only). /whats-on-all/ is server-rendered — 12 cards
// confirmed live, no pagination.
//
// Card shape:
//   <div class="c-col-card c-col-card--event">
//     <img src="..." data-lazyload ...>
//     <h3 class="c-col-title">Title</h3>
//     <p class="c-col-card--event__excerpt">Description</p>
//     <time class="c-col-card--event__date" datetime="FREE TEXT">FREE TEXT</time>
//     <a class="c-col-card__link" href="https://.../whats-on/SLUG/">...</a>
//   </div>
// The `datetime` attribute is NOT ISO — it duplicates the element's own
// free-text content verbatim, so the text is parsed either way. Two date
// shapes seen live: a full range ("25 April – 6 September 2026", sometimes
// with the year only on the end side) and a single day with a trailing
// time/time-range after a comma ("13 September, 12–1pm", "4 September,
// 10–10.45am or 11–11.45am") — only the segment before the first comma is
// parsed; the time portion is too irregular (ranges, "or" alternatives) to
// reliably apply on top.

const BASE_URL = "https://www.kettlesyard.cam.ac.uk";
const LISTING_URL = `${BASE_URL}/whats-on-all/`;

const VENUE = {
  name: "Kettle's Yard",
  address: "Castle Street",
  city: "Cambridge",
  region: "Cambridgeshire",
  postcode: "CB3 0AQ",
  lat: 52.210949,
  lng: 0.11448,
};

export interface KettlesYardRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
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

// "25 April – 6 September 2026" / "19 September 2026 – 31 January 2027" /
// "13 September, 12–1pm" (time portion after the comma is dropped).
function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const dateSegment = raw.replace(/\s+/g, " ").split(",")[0].trim();
  if (!dateSegment) return { startAt: null, endAt: null };

  const parts = dateSegment.split(/\s*[–—-]\s*/);
  // A range spanning a year boundary can carry the year on only one side —
  // extracting one shared fallback year up front (same fix used in
  // lib/sources/spike-island.ts) stops the year-less side from guessing
  // wrong via parseDMY's "more than 60 days past -> assume next year" rule.
  const yearMatch = dateSegment.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): KettlesYardRawEvent[] {
  const $ = cheerio.load(html);
  const events: KettlesYardRawEvent[] = [];
  const seen = new Set<string>();

  $(".c-col-card--event").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a.c-col-card__link").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".c-col-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".c-col-card--event__date").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const description =
      $card.find(".c-col-card--event__excerpt").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      url: href,
    });
  });

  return events;
}

export async function fetchKettlesYardEvents(): Promise<KettlesYardRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Kettle's Yard listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseKettlesYardEvent(raw: KettlesYardRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Kettle's Yard event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Kettle's Yard", sourceType: "kettles-yard", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "kettles-yard", id: raw.slug, url: raw.url },
  };
}
