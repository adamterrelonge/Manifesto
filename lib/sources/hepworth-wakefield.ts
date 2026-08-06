import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// /whats-on/ is a single unpaginated page (confirmed live — no pager
// markup). Card markup: div.c-block-item
//   .c-block-item__cover-link  — href (a sibling of the content, not a
//                                wrapper — the whole card is not a link)
//   .c-block-item__heading     — title
//   .c-block-item__date        — free text, always with extra info trailing
//                                the date range after the first comma
//                                ("23 May – 1 November 2026, FREE for
//                                Members, Wakefield District residents &
//                                under 18s") — only the part before the
//                                first comma is parsed as the date/range
//   .c-block-item__excerpt     — description
//   .o-media__img              — image
// No per-card category signal on this listing (mixes exhibitions, family
// activities, and talks) — category is left null for the downstream
// keyword-inference pipeline stage rather than guessed.

const BASE_URL = "https://hepworthwakefield.org";
const LISTING_PATH = "/whats-on/";

const VENUE = {
  name: "The Hepworth Wakefield",
  address: "Gallery Walk",
  city: "Wakefield",
  region: "West Yorkshire",
  postcode: "WF1 5AW",
  lat: 53.68,
  lng: -1.4913,
};

export interface HepworthWakefieldRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const dateSegment = raw.split(",")[0].replace(/\s+/g, " ").trim();
  if (!dateSegment) return { startAt: null, endAt: null };

  const parts = dateSegment.split(/\s*[–—-]\s*/);
  const yearMatch = dateSegment.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): HepworthWakefieldRawEvent[] {
  const $ = cheerio.load(html);
  const events: HepworthWakefieldRawEvent[] = [];

  $(".c-block-item").each((_, el) => {
    const $card = $(el);

    const href = $card.find(".c-block-item__cover-link").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $card.find(".c-block-item__heading").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const rawDate = $card.find(".c-block-item__date").first().text();
    const { startAt, endAt } = parseDateRange(rawDate);
    if (!startAt) return; // unparseable date — skip

    const isFree = /free/i.test(rawDate);
    const description =
      $card.find(".c-block-item__excerpt").first().text().replace(/\s+/g, " ").trim() || null;

    const img = $card.find(".o-media__img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      isFree,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHepworthWakefieldEvents(): Promise<HepworthWakefieldRawEvent[]> {
  const res = await fetch(`${BASE_URL}${LISTING_PATH}`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Hepworth Wakefield listing error: ${res.status} ${res.statusText}`);

  return parseListingPage(await res.text());
}

export function normaliseHepworthWakefieldEvent(raw: HepworthWakefieldRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "The Hepworth Wakefield",
      sourceType: "hepworth-wakefield",
      profileUrl: `${BASE_URL}${LISTING_PATH}`,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "hepworth-wakefield", id: raw.slug, url: raw.url },
  };
}
