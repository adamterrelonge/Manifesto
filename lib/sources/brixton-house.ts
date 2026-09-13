import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDayRange } from "./scrape-utils";

// Brixton House — 385 Coldharbour Lane, SW9 8GL. WordPress "shows" custom
// post type, rendered as a block-theme query loop (`li.type-shows`) on
// /whats-on/. Dates are free text with no year on either side (e.g.
// "15 September-19 September"), handled by the same parseDayRange used
// for Ladbroke Hall/Sadler's Wells/Yard Theatre. The page shows a WP
// query-pagination block, meaning older/later shows may sit on a page 2
// this adapter doesn't fetch — same "first page only" limitation as
// street-level-photoworks.ts elsewhere in this codebase; ~20 shows are on
// the first page at time of writing, more than enough forward coverage.

const BASE_URL = "https://brixtonhouse.co.uk";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "Brixton House",
  address: "385 Coldharbour Lane",
  city: "London",
  region: "Greater London",
  postcode: "SW9 8GL",
  lat: null as number | null,
  lng: null as number | null,
};

export interface BrixtonHouseRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

export async function fetchBrixtonHouseEvents(): Promise<BrixtonHouseRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Brixton House listing error: ${res.status} ${res.statusText}`);

  const $ = cheerio.load(await res.text());
  const events: BrixtonHouseRawEvent[] = [];
  const seen = new Set<string>();

  $("li.type-shows").each((_, el) => {
    const $card = $(el);

    const title = $card.find(".wp-block-post-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const linkEl = $card.find("a[href]").first();
    const href = linkEl.attr("href") ?? "";
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const slugMatch = url.match(/\/shows\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1] : url;
    if (seen.has(slug)) return;
    seen.add(slug);

    const dateText = $card.find(".bhwpspx-date").first().text().replace(/\s+/g, " ").trim();
    const { startAt, endAt } = parseDayRange(dateText);
    if (!startAt) return;

    const description =
      $card.find(".wp-block-post-excerpt__excerpt").first().text().replace(/\s+/g, " ").trim() ||
      null;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      url,
    });
  });

  return events;
}

export function normaliseBrixtonHouseEvent(raw: BrixtonHouseRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Brixton House event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Brixton House", sourceType: "brixton-house", profileUrl: BASE_URL },
    category: "theatre-performance",
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "brixton-house", id: raw.slug, url: raw.url },
  };
}
