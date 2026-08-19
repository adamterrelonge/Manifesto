import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS } from "./scrape-utils";

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

// Cards render as:
//   <li class="c-feed__item">
//     <a class="c-media c-media--event c-media--link" href="https://www.nms.ac.uk/exhibitions/SLUG">
//       <img class="o-image__img" src="...">
//       <span class="c-media__pretitle">Exhibition|Event</span>
//       <h3 class="c-media__title">Title</h3>
//       <span class="c-media__posttitle">
//         <time datetime="ISO" itemprop="startDate">...</time> – <time datetime="ISO" itemprop="endDate">...</time>
//       </span>
//       <div class="c-media__summary">description</div>
//       <div class="c-media__flag">Free</div>   <!-- only present on free entries -->
//     </a>
//   </li>
// Exhibitions and a handful of single-run events carry real
// itemprop=startDate/endDate ISO timestamps; recurring tours/family
// sessions ("Wed 26 Aug and Fri 18 Sept, 09:45 - 10:30") have no <time>
// tag at all and no single reliable start — skipped rather than
// mis-parsed, confirmed against live markup.
function parseListingPage(html: string): NationalMuseumScotlandRawEvent[] {
  const $ = cheerio.load(html);
  const events: NationalMuseumScotlandRawEvent[] = [];

  $("li.c-feed__item > a.c-media").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find("h3.c-media__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const startAt = $card.find('time[itemprop="startDate"]').first().attr("datetime") ?? null;
    if (!startAt) return;

    const endAt = $card.find('time[itemprop="endDate"]').first().attr("datetime") ?? null;
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
    if (!res.ok) break;

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

  return [...seen.values()];
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
