import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://www.museumofthehome.org.uk";

const VENUE = {
  name: "Museum of the Home",
  address: "136 Kingsland Road",
  city: "London",
  region: "Greater London",
  postcode: "E2 8EA",
  lat: 51.5293,
  lng: -0.0768,
};

export interface MuseumOfHomeRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  dateText: string;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

// "Tuesday 1 September - Wednesday 30 September 2026"
// "Saturday 3 October-Sunday 4 October 2026"
// "Multiple dates in September" → skip
// "Permanent" → skip
function parseMothDate(raw: string): { startAt: string | null; endAt: string | null } {
  if (/permanent|open \d|multiple/i.test(raw)) return { startAt: null, endAt: null };

  // Split on dash between letter and uppercase: covers both "- " and "-" without spaces
  const parts = raw.split(/(?<=[a-zA-Z])\s*[-–]\s*(?=[A-Z])/);
  if (parts.length >= 2) {
    const endDate = parseDMY(parts[parts.length - 1]);
    const startDate = parseDMY(parts[0], endDate?.getFullYear());
    return {
      startAt: startDate ? startDate.toISOString() : null,
      endAt: endDate ? endDate.toISOString() : null,
    };
  }
  const single = parseDMY(raw);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

export async function fetchMuseumOfHomeEvents(): Promise<MuseumOfHomeRawEvent[]> {
  const res = await fetch(`${BASE_URL}/whats-on/`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Museum of the Home listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const now = new Date();
  const events: MuseumOfHomeRawEvent[] = [];

  $(".card--base").each((_, el) => {
    (function (node: typeof el) {
      const $card = $(node);

      const title = $card.find(".card-title").first().text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const href = $card.find("a.card-accessible-link").first().attr("href") ?? "";
      if (!href) return;

      const slug = href
        .replace(/^https?:\/\/[^/]+/, "")
        .replace(/\/$/, "")
        .replace(/^\/(?:whats-on|festival|plan-your-visit\/tours)\//, "");
      if (!slug) return;

      const dateText = $card.find(".card-date").first().text().replace(/\s+/g, " ").trim();
      const { startAt, endAt } = parseMothDate(dateText);

      // Skip events with no parseable dates (permanent displays, etc.)
      if (!startAt) return;

      const endDate = endAt ? new Date(endAt) : null;
      if (endDate && endDate < now) return;

      const imgSrc = $card.find("img.card-img").first().attr("src") ?? null;
      const imageUrl = imgSrc
        ? imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`
        : null;

      const description =
        $card.find(".card-summary p").first().text().replace(/\s+/g, " ").trim() || null;

      const priceText = $card.find(".card-price").first().text().toLowerCase();
      const isFree = /\bfree\b/.test(priceText);

      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      events.push({ slug, title, description, imageUrl, dateText, startAt, endAt, isFree, url });
    })(el);
  });

  return events;
}

export function normaliseMuseumOfHomeEvent(raw: MuseumOfHomeRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Museum of the Home event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Museum of the Home",
      sourceType: "museum-of-home",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "museum-of-home", id: raw.slug, url: raw.url },
  };
}
