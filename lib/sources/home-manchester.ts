import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY, parseTime, applyTime } from "./scrape-utils";

// /whats-on is a paginated listing (?page=N, 1-indexed — page 1 has no
// query param, the visible "next" link from it is ?page=2). Card markup:
//   li.eventCard
//     .title              — title
//     .top-date .start    — day+date text ("Tue 2 Jun"), no year, with a
//                            nested .time span ("10:00")
//     .top-date .end       — same shape for the end date/time
//     .venue               — an internal HOME space name, not a separate
//                            address (single physical venue overall)
//     .genres__item        — one or more category tags, e.g. "Art"/"Cinema"
// Neither .start nor .end carries a year, so the end date is resolved first
// via the shared inferYear heuristic (safe — end dates for a listed event
// are rarely far in the past), then the start date is resolved using that
// same year; if that makes start land after end (a Dec/Jan-boundary run),
// the start's year is stepped back by one.

const BASE_URL = "https://homemcr.org";
const LISTING_PATH = "/whats-on";
const MAX_PAGES = 15;

const VENUE = {
  name: "HOME",
  address: "2 Tony Wilson Place",
  city: "Manchester",
  region: "Greater Manchester",
  postcode: "M15 4FN",
  lat: 53.474,
  lng: -2.2453,
};

const GENRE_CATEGORY: Record<string, Category> = {
  Art: "gallery-exhibition",
  Cinema: "film",
  Film: "film",
  Theatre: "theatre-performance",
  Dance: "theatre-performance",
  Music: "music",
  Talks: "workshop-talk",
  Workshops: "workshop-talk",
  Family: "family-kids",
};

export interface HomeManchesterRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean;
  genres: string[];
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

function parseSideDate($side: cheerio.Cheerio<any>, defaultYear?: number): Date | null {
  const $clone = $side.clone();
  const timeText = $clone.find(".time").text().trim();
  $clone.find(".time").remove();
  const dateText = $clone.text().replace(/\s+/g, " ").trim();

  const date = parseDMY(dateText, defaultYear);
  if (!date) return null;
  return timeText && parseTime(timeText) ? applyTime(date, timeText) : date;
}

function parseListingPage(html: string): HomeManchesterRawEvent[] {
  const $ = cheerio.load(html);
  const events: HomeManchesterRawEvent[] = [];

  $("li.eventCard").each((_, el) => {
    const $card = $(el);

    const $link = $card.find("a.desc").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find(".title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const $endEl = $card.find(".top-date .end").first();
    const end = $endEl.length ? parseSideDate($endEl) : null;

    const $startEl = $card.find(".top-date .start").first();
    if ($startEl.length === 0) return;
    let start = parseSideDate($startEl, end?.getFullYear());
    if (!start) return;
    if (end && start > end) {
      start = parseSideDate($startEl, end.getFullYear() - 1);
      if (!start) return;
    }

    const genres = $card
      .find(".genres__item")
      .map((_, g) => $(g).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((g) => g);

    const isFree = /\bfree\b/i.test(`${title} ${genres.join(" ")}`);

    const img = $card.find("picture img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      description: null,
      imageUrl,
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      isFree,
      genres,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHomeManchesterEvents(): Promise<HomeManchesterRawEvent[]> {
  const seen = new Map<string, HomeManchesterRawEvent>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? `${BASE_URL}${LISTING_PATH}` : `${BASE_URL}${LISTING_PATH}?page=${page}`;
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) throw new Error(`HOME listing page ${page} error: ${res.status} ${res.statusText}`);

    const pageEvents = parseListingPage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const event of pageEvents) seen.set(event.slug, event);
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

export function normaliseHomeManchesterEvent(raw: HomeManchesterRawEvent): NormalisedEvent {
  let category: Category | null = null;
  for (const g of raw.genres) {
    if (GENRE_CATEGORY[g]) {
      category = GENRE_CATEGORY[g];
      break;
    }
  }

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "HOME", sourceType: "home-manchester", profileUrl: `${BASE_URL}${LISTING_PATH}` },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "home-manchester", id: raw.slug, url: raw.url },
  };
}
