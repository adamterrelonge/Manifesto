import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// Firstsite, Colchester. robots.txt permissive (WooCommerce/Yoast only),
// /whats-on/ returns a clean 200, server-rendered (not an SPA). Card shape:
//   <div class="event col-12" data-start-date="20231109" data-end-date="20260927" ...>
//     <div class="categories"><p>Exhibitions</p></div>
//     <div class="freeBubble"><p>Free</p></div>          (only when free)
//     <div class="eventText">
//       <h3><a href="...">Title</a></h3>
//       <div class="eventTimings"><p class="dates 1"><span class="date">...</span></p></div>
//       <p>Description...</p>
//     </div>
//   </div>
// `data-start-date`/`data-end-date` are already YYYYMMDD — no free-text date
// parsing needed at all. ~100 cards on one unpaginated fetch (this listing
// includes long-running/recurring items going back to 2023 alongside
// current ones — left as-is, same as every other adapter here, since
// downstream quality/expiry scoring is what decides what's actually shown).

const BASE_URL = "https://firstsite.uk";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "Firstsite",
  address: "Lewis Gardens, High Street",
  city: "Colchester",
  region: "Essex",
  postcode: "CO1 1JH",
  lat: 51.888741,
  lng: 0.906218,
};

export interface FirstsiteRawEvent {
  slug: string;
  title: string;
  description: string | null;
  tag: string | null;
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

// "20231109" -> ISO string (local midnight, matching how every other
// day-only adapter in this codebase treats a bare date).
function toIso(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return null;
  const year = parseInt(yyyymmdd.slice(0, 4), 10);
  const month = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const day = parseInt(yyyymmdd.slice(6, 8), 10);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseListingPage(html: string): FirstsiteRawEvent[] {
  const $ = cheerio.load(html);
  const events: FirstsiteRawEvent[] = [];
  const seen = new Set<string>();

  $("div.event[data-start-date]").each((_, el) => {
    const $card = $(el);

    const $link = $card.find(".eventText h3 a[href]").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $link.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const startAt = toIso($card.attr("data-start-date"));
    if (!startAt) return;
    const endAt = toIso($card.attr("data-end-date"));

    const tag = $card.find(".categories p").first().text().replace(/\s+/g, " ").trim() || null;
    const isFree = $card.find(".freeBubble").length > 0;

    const description =
      $card.find(".eventText > p").first().text().replace(/\s+/g, " ").trim() || null;

    // `.image` is a sibling of `.imageBanner` (both under `.imageColumn`),
    // not nested inside it — `.imageBanner .image` never matches. Most
    // cards also lazy-load via WP Rocket: the real URL sits in `data-bg`
    // with an empty `style=""` until client-side JS resolves it, so that's
    // checked first; the `style` background-image is only ever populated
    // server-side for the handful of above-the-fold cards.
    const $image = $card.find(".imageColumn .image").first();
    const dataBg = $image.attr("data-bg");
    const bg = $image.attr("style") ?? "";
    const imgMatch = bg.match(/url\(([^)]+)\)/);
    const imageUrl = dataBg || (imgMatch ? imgMatch[1].replace(/^['"]|['"]$/g, "") : null);

    events.push({
      slug,
      title,
      description,
      tag,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchFirstsiteEvents(): Promise<FirstsiteRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Firstsite listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseFirstsiteEvent(raw: FirstsiteRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Firstsite event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Firstsite",
      sourceType: "firstsite",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "firstsite", id: raw.slug, url: raw.url },
  };
}
