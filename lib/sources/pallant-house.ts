import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// /exhibitions is a single unpaginated page (confirmed live — no pager
// markup). Card markup: a > div.c-event-card (both the featured and
// standard card variants share the same inner structure):
//   .c-col-title          — title
//   .c-event-card__date   — date/range text; the `datetime` attribute is
//                           always empty in practice, so this always parses
//                           the visible text instead
//   .c-event-card__genre  — category text wrapped in odd bracket glyphs,
//                           e.g. "[ Exhibition )" — stripped before mapping
//   img                   — image

const BASE_URL = "https://pallant.org.uk";
const LISTING_PATH = "/exhibitions";

const VENUE = {
  name: "Pallant House Gallery",
  address: "9 North Pallant",
  city: "Chichester",
  region: "West Sussex",
  postcode: "PO19 1TJ",
  lat: 50.8365,
  lng: -0.7765,
};

const GENRE_CATEGORY: Record<string, Category> = {
  Exhibition: "gallery-exhibition",
  Talk: "workshop-talk",
  Tour: "workshop-talk",
  Workshop: "workshop-talk",
  Family: "family-kids",
};

export interface PallantHouseRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  genre: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

// "30 May – 1 November 2026" / "8 May – Spring 2027" (endAt unparseable —
// dropped, startAt still kept) / a single date with no range.
function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): PallantHouseRawEvent[] {
  const $ = cheerio.load(html);
  const events: PallantHouseRawEvent[] = [];

  $(".c-event-card").each((_, el) => {
    const $card = $(el);
    const $link = $card.closest("a[href]");
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find(".c-col-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".c-event-card__date").first().text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return; // unparseable date — skip

    const genreRaw = $card.find(".c-event-card__genre").first().text();
    const genre = genreRaw.replace(/[[\]()]/g, "").trim() || null;

    const img = $card.find("img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt,
      endAt,
      genre,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchPallantHouseEvents(): Promise<PallantHouseRawEvent[]> {
  const res = await fetch(`${BASE_URL}${LISTING_PATH}`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Pallant House listing error: ${res.status} ${res.statusText}`);

  return parseListingPage(await res.text());
}

export function normalisePallantHouseEvent(raw: PallantHouseRawEvent): NormalisedEvent {
  const category: Category | null = raw.genre ? GENRE_CATEGORY[raw.genre] ?? null : null;

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Pallant House Gallery",
      sourceType: "pallant-house",
      profileUrl: `${BASE_URL}${LISTING_PATH}`,
    },
    category,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "pallant-house", id: raw.slug, url: raw.url },
  };
}
