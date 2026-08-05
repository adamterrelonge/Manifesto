import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, mapWithConcurrency } from "./scrape-utils";

// /whats-on is just a nav hub with no individual listings — the actual
// programme lives at /calendar, a single unpaginated page (confirmed: 8
// cards, no pagination markers). Cards show opening hours, not exhibition
// run dates ("10:00 - 17:00" is the museum's daily hours, not a date range)
// — the real date range only appears on the detail page in a
// `time.date.icon-date` element ("1 May – 4 October 2026"), so every card
// needs a follow-up fetch.

const BASE_URL = "https://designmuseum.org";
const LISTING_URL = `${BASE_URL}/calendar`;
const DETAIL_FETCH_CONCURRENCY = 4;

const VENUE = {
  name: "Design Museum",
  address: "224-238 Kensington High Street",
  city: "London",
  region: "Greater London",
  postcode: "W8 6AG",
  lat: 51.5008,
  lng: -0.1997,
};

export interface DesignMuseumRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// "1 May – 4 October 2026" (also handles a plain single date with no range).
function parseExhibitionRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // A bare day+month on the left with no year of its own (e.g. "1 May – 4
  // October 2026") borrows the year from the right part.
  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

async function fetchExhibitionDates(url: string): Promise<{ startAt: string | null; endAt: string | null }> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return { startAt: null, endAt: null };

    const $ = cheerio.load(await res.text());
    const dateText = $("time.date.icon-date").first().text();
    return parseExhibitionRange(dateText);
  } catch {
    return { startAt: null, endAt: null };
  }
}

interface ListingCard {
  slug: string;
  title: string;
  description: string | null;
  isFree: boolean;
  url: string;
}

function parseListingPage(html: string): ListingCard[] {
  const $ = cheerio.load(html);
  const cards: ListingCard[] = [];
  const seen = new Set<string>();

  $(".related-event").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h3").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    // p.short-title carries the category tag ("Free display", "Exhibition")
    // — the sentence description is the following <p>.
    const description =
      $card
        .find("p")
        .filter((_, p) => !$(p).hasClass("short-title"))
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() || null;

    const isFree = /free/i.test($card.find(".short-title").first().text());

    cards.push({ slug, title, description, isFree, url: href });
  });

  return cards;
}

export async function fetchDesignMuseumEvents(): Promise<DesignMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Design Museum listing error: ${res.status} ${res.statusText}`);

  const cards = parseListingPage(await res.text());
  const detailResults = await mapWithConcurrency(cards, DETAIL_FETCH_CONCURRENCY, (c) =>
    fetchExhibitionDates(c.url)
  );

  const now = new Date();
  const events: DesignMuseumRawEvent[] = [];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const { startAt, endAt } = detailResults[i];
    if (!startAt) continue; // unparseable date on the detail page — skip

    const endDate = endAt ? new Date(endAt) : null;
    if (endDate && endDate < now) continue;

    events.push({
      slug: c.slug,
      title: c.title,
      description: c.description,
      imageUrl: null,
      startAt,
      endAt,
      isFree: c.isFree,
      url: `${BASE_URL}${c.url}`,
    });
  }

  return events;
}

export function normaliseDesignMuseumEvent(raw: DesignMuseumRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Design Museum event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Design Museum",
      sourceType: "design-museum",
      profileUrl: LISTING_URL,
    },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "design-museum", id: raw.slug, url: raw.url },
  };
}
