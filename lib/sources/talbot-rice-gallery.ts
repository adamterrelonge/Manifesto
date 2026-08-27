import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Talbot Rice Gallery (University of Edinburgh). robots.txt permissive
// (standard Drupal core/profiles block only), /whats-on returns a clean 200
// to Node's fetch. Two distinct DOM shapes on the one page:
//
//   Regular event cards — `a.card.card--link` (5 seen live):
//     <a href="/event/SLUG" class="card card--link">
//       <div class="card-body p-0">
//         <h2 class="card-title h4 mt-3"><span class="underline"><span>TITLE</span></span></h2>
//         <h6 class="card-subtitle h6 m-0">Thursday 27 August, 10am</h6>
//         <p class="card-text mt-3"><p>description...</p></p>
//     No year in the date text — parseDMY falls back to scrape-utils'
//     inferYear (assumes next year if the resulting date would be >60 days
//     in the past), which is the correct behaviour here.
//
//   Featured exhibition — `a.featured-card` (1 seen live), a structurally
//   separate block: the link/title live inside `#current-exhibitions
//   a.featured-card`, but the date range ("27 Jun – 27 Sep 2026") is in a
//   *sibling* row's `h2.h4.my-2`, not nested inside the link at all. Paired
//   by index (i-th featured-card with i-th h4.my-2) since both have always
//   matched 1-for-1 in practice.
const BASE_URL = "https://www.trg.ed.ac.uk";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUE = {
  name: "Talbot Rice Gallery",
  address: "Old College, South Bridge",
  city: "Edinburgh",
  region: "City of Edinburgh",
  postcode: "EH8 9YL",
  lat: 55.947687,
  lng: -3.187349,
};

export interface TalbotRiceGalleryRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*[–—-]\s*/);

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

// "Thursday 27 August, 10am" (event cards) — strip the leading day-of-week
// (parseDMY already tolerates it) and any trailing time-of-day text after a
// comma, since parseDMY doesn't parse times and a stray "10am" would just
// fail to match without changing the date result either way.
function parseEventDate(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  const datePart = clean.split(",")[0];
  const start = parseDMY(datePart);
  return { startAt: start ? start.toISOString() : null, endAt: null };
}

function parseListingPage(html: string): TalbotRiceGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: TalbotRiceGalleryRawEvent[] = [];
  const seen = new Set<string>();

  // Featured exhibition(s): link+title in a.featured-card, date in a
  // sibling h2.h4.my-2 — paired by position within #current-exhibitions.
  const featuredLinks = $("#current-exhibitions a.featured-card");
  const featuredDates = $("#current-exhibitions h2.h4.my-2");
  featuredLinks.each((i, el) => {
    const $link = $(el);
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;

    const title = $link.find(".featured-card-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = featuredDates.eq(i).text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;
    seen.add(slug);

    const imageUrl = $link.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description: null,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt,
      endAt,
      url: `${BASE_URL}${href}`,
    });
  });

  // Regular event cards.
  $("a.card.card--link").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".card-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".card-subtitle").first().text();
    const { startAt, endAt } = parseEventDate(dateText);
    if (!startAt) return;

    const description =
      $card.find(".card-text").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt,
      endAt,
      url: `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchTalbotRiceGalleryEvents(): Promise<TalbotRiceGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Talbot Rice Gallery listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseTalbotRiceGalleryEvent(raw: TalbotRiceGalleryRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Talbot Rice Gallery event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Talbot Rice Gallery",
      sourceType: "talbot-rice-gallery",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "talbot-rice-gallery", id: raw.slug, url: raw.url },
  };
}
