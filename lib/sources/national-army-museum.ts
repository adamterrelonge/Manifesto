import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// /whats-on is a paginated Drupal Views listing (?page=N, 0-indexed — the
// live "next" link at the bottom of page 0 points to ?page=1). The same
// listing page also surfaces permanent-gallery links (/plan-visit/galleries/*)
// in an unrelated section further down, so cards are filtered to /whats-on/*
// hrefs only. Card markup: div.card
//   .card__tag         — category badge, e.g. "Workshop"/"Challenge"
//   .card__meta-item   — two spans: date text first, price second ("FREE" or
//                        "£15.00"); date text is either "D Mon YYYY" or a
//                        same-month day range "D-D Mon YYYY" ("6-7 Aug 2026")
//   .card__title a     — title + href
//   .card__teaser      — description
//   .card__image img   — image

const BASE_URL = "https://www.nam.ac.uk";
const LISTING_PATH = "/whats-on";
const MAX_PAGES = 10;

const VENUE = {
  name: "National Army Museum",
  address: "Royal Hospital Road",
  city: "London",
  region: "Greater London",
  postcode: "SW3 4HT",
  lat: 51.4913,
  lng: -0.159,
};

const TAG_CATEGORY: Record<string, Category> = {
  Workshop: "workshop-talk",
  Talk: "workshop-talk",
  Tour: "workshop-talk",
  Exhibition: "gallery-exhibition",
  Family: "family-kids",
  Challenge: "family-kids",
};

export interface NationalArmyMuseumRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean;
  tag: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// "24 Aug 2026" (single) / "6-7 Aug 2026" (same-month day range) / a general
// "D Mon - D Mon YYYY" range as a fallback.
function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*-\s*/);
  if (parts.length === 1) {
    const d = parseDMY(clean);
    return { startAt: d ? d.toISOString() : null, endAt: null };
  }

  if (/^\d{1,2}$/.test(parts[0])) {
    const end = parseDMY(parts[1]);
    if (!end) return { startAt: null, endAt: null };
    const start = new Date(end.getFullYear(), end.getMonth(), parseInt(parts[0], 10));
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const start = parseDMY(parts[0], year);
  const end = parseDMY(parts[1], year);
  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): NationalArmyMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: NationalArmyMuseumRawEvent[] = [];

  $("div.card").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find(".card__title a").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href.startsWith("/whats-on/")) return; // skip permanent-gallery cards

    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const metaItems = $card
      .find(".card__meta-item")
      .map((_, m) => $(m).clone().children().remove().end().text().replace(/\s+/g, " ").trim())
      .get()
      .filter((t) => t);
    const dateText = metaItems[0] ?? "";
    const priceText = metaItems[1] ?? "";

    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return; // unparseable date — skip

    const isFree = /free/i.test(priceText);
    const tag = $card.find(".card__tag").first().text().trim() || null;
    const description = $card.find(".card__teaser").first().text().replace(/\s+/g, " ").trim() || null;

    const img = $card.find(".card__image img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      isFree,
      tag,
      url: `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchNationalArmyMuseumEvents(): Promise<NationalArmyMuseumRawEvent[]> {
  const seen = new Map<string, NationalArmyMuseumRawEvent>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${BASE_URL}${LISTING_PATH}?page=${page}`, {
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) {
      throw new Error(`National Army Museum listing page ${page} error: ${res.status} ${res.statusText}`);
    }

    const pageEvents = parseListingPage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const event of pageEvents) seen.set(event.slug, event);
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

export function normaliseNationalArmyMuseumEvent(raw: NationalArmyMuseumRawEvent): NormalisedEvent {
  const category: Category | null = raw.tag ? TAG_CATEGORY[raw.tag] ?? null : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "National Army Museum",
      sourceType: "national-army-museum",
      profileUrl: `${BASE_URL}${LISTING_PATH}`,
    },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "national-army-museum", id: raw.slug, url: raw.url },
  };
}
