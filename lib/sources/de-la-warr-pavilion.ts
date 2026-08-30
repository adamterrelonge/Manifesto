import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Bexhill-on-Sea. `/whats-on/` cards (`.single__event`) carry a free-text
// `<h3>` date with a `<br/>` between start/end ("Wednesday 19 April 2023 –
// <br/>Wednesday 31 March 2027") — the trailing space before the dash
// means cheerio's .text() concatenates cleanly across the <br/>, no
// stripping needed. Many cards have no year at all on either side
// ("Thursday 27 August – Thursday 18 February") — each side's year is
// inferred independently via scrape-utils' inferYear (a known minor
// imprecision for a same-listing cross-year run, accepted rather than
// adding bespoke cross-year logic for what's a small minority of cards).

const BASE_URL = "https://www.dlwp.com";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "De La Warr Pavilion",
  address: "Marina",
  city: "Bexhill-on-Sea",
  region: "East Sussex",
  postcode: "TN40 1DP",
  lat: 50.8378,
  lng: 0.4736,
};

export interface DeLaWarrPavilionRawEvent {
  slug: string;
  title: string;
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

function parseListingPage(html: string): DeLaWarrPavilionRawEvent[] {
  const $ = cheerio.load(html);
  const events: DeLaWarrPavilionRawEvent[] = [];
  const seen = new Set<string>();

  $(".single__event").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find("h2").parent("a");
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h2").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find("h3").first().text().replace(/\s+/g, " ").trim();
    const parts = dateText.split(/\s*[–—-]\s*/);
    const start = parseDMY(parts[0]);
    if (!start) return;
    const end = parts.length >= 2 ? parseDMY(parts[parts.length - 1]) : null;

    const imageUrl = $card.find(".image__holder").first().attr("data-src") ?? null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchDeLaWarrPavilionEvents(): Promise<DeLaWarrPavilionRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`De La Warr Pavilion listing error: ${res.status} ${res.statusText}`);
  }
  return parseListingPage(await res.text());
}

export function normaliseDeLaWarrPavilionEvent(raw: DeLaWarrPavilionRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "De La Warr Pavilion",
      sourceType: "de-la-warr-pavilion",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "de-la-warr-pavilion", id: raw.slug, url: raw.url },
  };
}
