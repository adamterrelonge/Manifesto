import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// /whats-on/exhibitions is a single unpaginated page (confirmed live — no
// pager markup). Card markup: li.o-grid__item > a.c-media
//   .c-media__title                              — title
//   .c-media__posttitle time[itemprop=startDate]  — ISO `datetime`, both
//   .c-media__posttitle time[itemprop=endDate]      required
//   .c-media__summary                             — description
//   .c-media__image img                           — image
// Every card on this page is an exhibition, so category is hardcoded rather
// than scraped, same as design-museum.ts.

const BASE_URL = "https://ysp.org.uk";
const LISTING_PATH = "/whats-on/exhibitions";

const VENUE = {
  name: "Yorkshire Sculpture Park",
  address: "West Bretton",
  city: "Wakefield",
  region: "West Yorkshire",
  postcode: "WF4 4LG",
  lat: 53.61,
  lng: -1.599,
};

export interface YorkshireSculptureParkRawEvent {
  slug: string;
  title: string;
  description: string | null;
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

function parseListingPage(html: string): YorkshireSculptureParkRawEvent[] {
  const $ = cheerio.load(html);
  const events: YorkshireSculptureParkRawEvent[] = [];

  $("a.c-media").each((_, el) => {
    const $card = $(el);

    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find(".c-media__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const startIso = $card.find('time[itemprop="startDate"]').first().attr("datetime");
    if (!startIso) return; // no machine-readable date — skip
    const endIso = $card.find('time[itemprop="endDate"]').first().attr("datetime");

    const description =
      $card.find(".c-media__summary").first().text().replace(/\s+/g, " ").trim() || null;

    const img = $card.find(".c-media__image img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt: new Date(startIso).toISOString(),
      endAt: endIso ? new Date(endIso).toISOString() : null,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchYorkshireSculptureParkEvents(): Promise<YorkshireSculptureParkRawEvent[]> {
  const res = await fetch(`${BASE_URL}${LISTING_PATH}`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Yorkshire Sculpture Park listing error: ${res.status} ${res.statusText}`);

  return parseListingPage(await res.text());
}

export function normaliseYorkshireSculptureParkEvent(
  raw: YorkshireSculptureParkRawEvent
): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Yorkshire Sculpture Park",
      sourceType: "yorkshire-sculpture-park",
      profileUrl: `${BASE_URL}${LISTING_PATH}`,
    },
    category: "gallery-exhibition",
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "yorkshire-sculpture-park", id: raw.slug, url: raw.url },
  };
}
