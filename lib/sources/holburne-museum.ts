import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Holburne Museum, Bath. `/whats-on/` is a server-rendered WordPress
// custom-post-type ("event") archive — `article.c-archive-event` cards
// with a single free-text date (`.c-archive-event__date`, always one date,
// no ranges seen) and an explicit cost field (`.c-archive-event__cost`,
// "FREE" or a price string). A couple of cards have no date at all
// (open-ended recurring series/clubs) and are skipped rather than guessed.

const BASE_URL = "https://holburne.org";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "Holburne Museum",
  address: "Great Pulteney Street",
  city: "Bath",
  region: "Somerset",
  postcode: "BA2 4DB",
  lat: 51.3844,
  lng: -2.3541,
};

export interface HolburneMuseumRawEvent {
  slug: string;
  title: string;
  isFree: boolean;
  imageUrl: string | null;
  startAt: string;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

function parseListingPage(html: string): HolburneMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: HolburneMuseumRawEvent[] = [];
  const seen = new Set<string>();

  $("article.c-archive-event").each((_, el) => {
    const $card = $(el);

    const href = $card.find(".c-archive-event__button a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".c-archive-event__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".c-archive-event__date").first().text().replace(/\s+/g, " ").trim();
    const start = dateText ? parseDMY(dateText) : null;
    if (!start) return;

    const cost = $card.find(".c-archive-event__cost").first().text().replace(/\s+/g, " ").trim();
    const isFree = /^free$/i.test(cost);

    const imageUrl = $card.find(".c-archive-event__image").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      isFree,
      imageUrl,
      startAt: start.toISOString(),
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHolburneMuseumEvents(): Promise<HolburneMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Holburne Museum listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseHolburneMuseumEvent(raw: HolburneMuseumRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: null,
    venue: VENUE,
    organiser: { name: "Holburne Museum", sourceType: "holburne-museum", profileUrl: LISTING_URL },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "holburne-museum", id: raw.slug, url: raw.url },
  };
}
