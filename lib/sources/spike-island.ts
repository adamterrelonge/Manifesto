import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Spike Island (Bristol) is server-rendered WordPress, not an SPA —
// robots.txt only disallows WooCommerce internals, no AI-bot block. The
// homepage-ish `/programme/` page is just a curated teaser (2 hero
// exhibitions); the real flat listings live at `/programme/exhibitions/`
// and `/programme/events/`, both confirmed live. Card markup on both:
//   a.card.exhibitions / a.card.events  — href, whole card is the link
//     .card__title        — title (nested <em> for subtitle, stripped)
//     .card__date-range   — free text, e.g. exhibitions:
//                            "Saturday 26 September 2026 to Sunday 31
//                            January 2027"; events add trailing
//                            time/price info after a comma, e.g.
//                            "Saturday 5 September 2026, 5pm–3am,
//                            £15–30. Early bird..." — only the segment
//                            before the first comma is parsed as the date.
//     .card__image img    — `data-src` (lazy-loaded; `src` is a base64
//                            placeholder, never the real image)
// No listing-card description on either page (title/date/link only), and
// the hero-slider duplicates on `/programme/` use a different class
// ("card--hero", not "card") so they're naturally excluded by the
// `.card.exhibitions`/`.card.events` selectors used here.

const BASE_URL = "https://www.spikeisland.org.uk";
const EXHIBITIONS_URL = `${BASE_URL}/programme/exhibitions/`;
const EVENTS_URL = `${BASE_URL}/programme/events/`;

const VENUE = {
  name: "Spike Island",
  address: "133 Cumberland Road",
  city: "Bristol",
  region: "Bristol",
  postcode: "BS1 6UX",
  lat: 51.446973,
  lng: -2.609594,
};

export interface SpikeIslandRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  isFree: boolean;
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

// "Saturday 26 September 2026 to Sunday 31 January 2027" (exhibitions), or
// "Saturday 5 September 2026, 5pm–3am, £15–30..." (events — only the
// part before the first comma is the date).
function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const dateSegment = raw.split(",")[0].replace(/\s+/g, " ").trim();
  if (!dateSegment) return { startAt: null, endAt: null };

  const parts = dateSegment.split(/\s+to\s+/i);
  // Ranges spanning a year boundary ("Saturday 31 January to Sunday 10 May
  // 2026") only carry the year on one side — parsing each side fully
  // independently lets the year-less side fall through to parseDMY's
  // "more than 60 days past -> assume next year" guess, which can push a
  // start date after its own end date. Extracting one shared year up front
  // and passing it as a fallback default fixes that; a side with its own
  // explicit year (like "Sunday 31 January 2027" in a same-string range
  // spanning two different years) still wins over this fallback, since
  // parseDMY only uses defaultYear when its own regex finds no year.
  const yearMatch = dateSegment.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseCards(html: string, selector: string): SpikeIslandRawEvent[] {
  const $ = cheerio.load(html);
  const events: SpikeIslandRawEvent[] = [];

  $(selector).each((_, el) => {
    const $card = $(el);

    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find(".card__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const rawDate = $card.find(".card__date-range").first().text();
    const { startAt, endAt } = parseDateRange(rawDate);
    if (!startAt) return; // unparseable date — skip

    const isFree = /\bfree\b/i.test(rawDate);

    const imgSrc = $card.find(".card__image").first().attr("data-src") ?? null;
    const imageUrl = imgSrc ? (imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`) : null;

    events.push({
      slug,
      title,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

async function fetchListingPage(url: string, selector: string): Promise<SpikeIslandRawEvent[]> {
  const res = await fetch(url, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Spike Island listing error: ${res.status} ${res.statusText}`);
  return parseCards(await res.text(), selector);
}

export async function fetchSpikeIslandEvents(): Promise<SpikeIslandRawEvent[]> {
  const [exhibitions, events] = await Promise.all([
    fetchListingPage(EXHIBITIONS_URL, "a.card.exhibitions"),
    fetchListingPage(EVENTS_URL, "a.card.events"),
  ]);

  const seen = new Set<string>();
  const combined: SpikeIslandRawEvent[] = [];
  for (const e of [...exhibitions, ...events]) {
    if (seen.has(e.slug)) continue;
    seen.add(e.slug);
    combined.push(e);
  }
  return combined;
}

export function normaliseSpikeIslandEvent(raw: SpikeIslandRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Spike Island event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Spike Island",
      sourceType: "spike-island",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "spike-island", id: raw.slug, url: raw.url },
  };
}
