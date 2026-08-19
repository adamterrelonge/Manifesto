import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

const BASE_URL = "https://www.birminghammuseums.org.uk";
const LISTING_URL = `${BASE_URL}/birmingham-museum-and-art-gallery/whats-on`;

const VENUE = {
  name: "Birmingham Museum & Art Gallery",
  address: "Chamberlain Square",
  city: "Birmingham",
  region: "West Midlands",
  postcode: "B3 3DH",
  lat: 52.4803,
  lng: -1.9036,
};

export interface BirminghamMuseumRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+\/?/, "").replace(/^\/+|\/+$/g, "");
}

// Same "c-media" component family as National Museum of Scotland (shared
// vendor template, not the same site), but here c-media__pretitle carries
// the venue name (this listing already spans Birmingham Museums' several
// sites) rather than a category, so it isn't used for classification. Only
// ~a third of cards get a real <time itemprop=startDate> — one-off events;
// the rest are recurring slots ("Selected Fridays") with free text only
// and no reliable single start — skipped rather than mis-parsed. No
// endDate is ever present in this template (unlike NMS).
//
// Two card wrapper shapes coexist on this page: some are a real
// `<a class="c-media" href="...">`; most are `<div class="c-media"
// @click="goToUrl('URL', $event)">` (a Vue directive string, not a usable
// href) with the real URL only recoverable from the "Details" button at
// `.c-media__actions a[href]` — so href resolution always checks the
// element's own href first and falls back to that button.
function parseListingPage(html: string): BirminghamMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: BirminghamMuseumRawEvent[] = [];
  const seen = new Set<string>();

  $(".c-media").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") || $card.find(".c-media__actions a[href]").first().attr("href") || "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    // h3.c-media__title embeds a screen-reader-only ".h-accessibility" span
    // (", at Birmingham Museum & Art Gallery.") that must be stripped before
    // reading the visible title text.
    const title = $card
      .find("h3.c-media__title")
      .first()
      .clone()
      .find(".h-accessibility")
      .remove()
      .end()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (!title) return;

    const startAt = $card.find('time[itemprop="startDate"]').first().attr("datetime") ?? null;
    if (!startAt) return;

    const description =
      $card.find(".c-media__summary").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img.o-image__img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({ slug, title, description, imageUrl, isFree, startAt, url: href });
  });

  return events;
}

export async function fetchBirminghamMuseumEvents(): Promise<BirminghamMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Birmingham Museum listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseBirminghamMuseumEvent(raw: BirminghamMuseumRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Birmingham Museum event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: null,
    venue: VENUE,
    organiser: {
      name: "Birmingham Museum & Art Gallery",
      sourceType: "birmingham-museum",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "birmingham-museum", id: raw.slug, url: raw.url },
  };
}
