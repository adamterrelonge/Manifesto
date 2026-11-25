import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://www.nms.ac.uk";
const LISTING_URL = `${BASE_URL}/national-museum-of-scotland/whats-on`;
// Confirmed live: only 2 real pages exist — page-3 repeats page-2's cards
// verbatim rather than 404ing, so fetchNationalMuseumScotlandEvents stops
// itself once a page adds nothing new. This cap is just headroom.
const MAX_PAGES = 4;

const VENUE = {
  name: "National Museum of Scotland",
  address: "Chambers Street",
  city: "Edinburgh",
  region: "City of Edinburgh",
  postcode: "EH1 1JF",
  lat: 55.9469,
  lng: -3.19,
};

const TAG_CATEGORY: Record<string, Category> = {
  exhibition: "gallery-exhibition",
  exhibitions: "gallery-exhibition",
};

export interface NationalMuseumScotlandRawEvent {
  slug: string;
  title: string;
  tag: string | null;
  description: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\/?/, "").replace(/^\/+|\/+$/g, "");
}

// Cards render as (re-verified 2026-11-25 — the card used to be the <a>
// itself; it's now a <div> with the link inside the title):
//   <li class="c-feed__item">
//     <div class="c-media c-media--event">
//       <img class="o-image__img" src="...">
//       <span class="c-media__pretitle">Exhibitions|Event...</span>
//       <h3 class="c-media__title"><a href="https://www.nms.ac.uk/exhibitions/SLUG">Title</a></h3>
//       <span class="c-media__posttitle">
//         <time datetime="ISO" itemprop="startDate">...</time> – <time datetime="ISO" itemprop="endDate">...</time>
//       </span>                         (or free text, see parsePosttitle)
//       <div class="c-media__summary">description</div>
//       <div class="c-media__flag">Free</div>   <!-- only present on free entries -->
//     </div>
//   </li>
// Only some cards still carry itemprop=startDate/endDate <time> tags; the
// rest give free text — parsePosttitle handles those.

// Free-text dates seen live:
//   "Sat 12 Jun 2027 - Sun 14 Nov 2027"
//   "Sat 23 May 2026 – Sat 27 Mar 2027, 10:30 - 12:00"      (recurring run)
//   "Sat 5 Dec, 10:00 - 16:30 drop-in activities, ..."      (single day + time)
//   "Tue 8 Dec and Thu 10 Dec, 18:00 - 20:30 (doors ...)"    (first date used)
// The date part is everything before the first comma. A start time is only
// applied to single-day entries — on a recurring run it's the daily slot,
// not when the run begins. Returns nulls when no date can be read.
export function parsePosttitle(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const [datePart, ...rest] = clean.split(",");
  const first = datePart.split(/\s+and\s+/i)[0];
  const parts = first.split(/\s*[–—-]\s*/);
  const years = first.match(/\d{4}/g);
  const lastYear = years ? parseInt(years[years.length - 1], 10) : undefined;

  const end = parts.length >= 2 ? parseDMY(parts[parts.length - 1], lastYear) : null;
  const start = parseDMY(parts[0], parts[0].match(/\d{4}/) ? undefined : lastYear);
  if (!start) return { startAt: null, endAt: null };
  if (end && start > end && !/\d{4}/.test(parts[0])) start.setFullYear(start.getFullYear() - 1);

  if (!end) {
    const time = rest.join(",").match(/\b(\d{1,2}):(\d{2})\b/);
    if (time) start.setHours(parseInt(time[1], 10), parseInt(time[2], 10));
  }
  return { startAt: start.toISOString(), endAt: end ? end.toISOString() : null };
}

export function parseListingPage(html: string): NationalMuseumScotlandRawEvent[] {
  const $ = cheerio.load(html);
  const events: NationalMuseumScotlandRawEvent[] = [];

  $("li.c-feed__item > .c-media").each((_, el) => {
    const $card = $(el);
    const href = $card.find(".c-media__title a").first().attr("href") ?? $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find(".c-media__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    let startAt = $card.find('time[itemprop="startDate"]').first().attr("datetime") ?? null;
    let endAt = $card.find('time[itemprop="endDate"]').first().attr("datetime") ?? null;
    if (!startAt) {
      ({ startAt, endAt } = parsePosttitle($card.find(".c-media__posttitle").first().text()));
    }
    if (!startAt) return;

    const tag = $card.find(".c-media__pretitle").first().text().trim().toLowerCase() || null;
    const description =
      $card.find(".c-media__summary").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img.o-image__img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({ slug, title, tag, description, imageUrl, isFree, startAt, endAt, url: href });
  });

  return events;
}

export async function fetchNationalMuseumScotlandEvents(): Promise<NationalMuseumScotlandRawEvent[]> {
  const seen = new Map<string, NationalMuseumScotlandRawEvent>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? LISTING_URL : `${LISTING_URL}/page-${page}`;
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    // Page 1 failing is the whole source failing — throw so the health
    // check reports it, instead of silently returning 0 events.
    if (!res.ok) {
      if (page === 1) throw new Error(`National Museum of Scotland listing error: ${res.status} ${res.statusText}`);
      break;
    }

    const pageEvents = parseListingPage(await res.text());
    let anyNew = false;
    for (const ev of pageEvents) {
      if (!seen.has(ev.slug)) {
        seen.set(ev.slug, ev);
        anyNew = true;
      }
    }
    if (!anyNew && page > 1) break;
  }

  const events = [...seen.values()];
  // A 200 page with zero parseable cards means the markup changed again.
  if (events.length === 0) throw new Error("National Museum of Scotland: listing parsed to 0 events — markup changed?");
  return events;
}

export function normaliseNationalMuseumScotlandEvent(
  raw: NationalMuseumScotlandRawEvent
): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`National Museum of Scotland event ${raw.slug} has no start date`);
  }

  const category: Category | null = raw.tag ? TAG_CATEGORY[raw.tag] ?? null : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "National Museum of Scotland",
      sourceType: "national-museum-scotland",
      profileUrl: LISTING_URL,
    },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "national-museum-scotland", id: raw.slug, url: raw.url },
  };
}
