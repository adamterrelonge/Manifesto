import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, applyTime, mapWithConcurrency } from "./scrape-utils";

// Cartwright Hall is one of several venues under the Bradford District Museums
// & Galleries umbrella site. Its dedicated venue page already filters to just
// this venue's programme (confirmed: every .exhibitionLoop_item on the page
// carries a "venueTaxonomy cartwright-hall-art-gallery" class), so no extra
// venue filtering is needed here.
//
// The listing page mixes three kinds of cards, distinguished only by whether
// .runningDateTime has text:
//  - one-off dated events ("6 August 2026 11:00 am – 6 August 2026 3:00 pm")
//    parsed straight from the card.
//  - recurring activities with no fixed date ("Every other Sunday") — skipped,
//    there's no single startAt to report.
//  - exhibitions, whose card has an empty .runningDateTime; the date range
//    only appears on the detail page in a `.singleEventDate h5` ("28 March
//    2026 – 31 August 2026"), so those need a follow-up fetch.

const BASE_URL = "https://bradfordmuseums.org";
const LISTING_URL = `${BASE_URL}/venue/cartwright-hall-art-gallery/`;
const DETAIL_FETCH_CONCURRENCY = 4;

const VENUE = {
  name: "Cartwright Hall Art Gallery",
  address: "Lister Park",
  city: "Bradford",
  region: "West Yorkshire",
  postcode: "BD9 4NS",
  lat: 53.8108,
  lng: -1.7663,
};

export interface CartwrightHallRawEvent {
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
  return url
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/event\//, "")
    .replace(/\/$/, "");
}

// "6 August 2026 11:00 am – 6 August 2026 3:00 pm" (also handles a plain
// single date/time with no range).
function parseCardDateTime(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–-]\s*/);

  function parsePart(part: string): Date | null {
    const date = parseDMY(part);
    if (!date) return null;
    const timeMatch = part.match(/(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm))/i);
    return timeMatch ? applyTime(date, timeMatch[1]) : date;
  }

  const start = parsePart(parts[0]);
  const end = parts.length >= 2 ? parsePart(parts[1]) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

// "28 March 2026  – 31 August 2026" from an exhibition detail page.
function parseExhibitionRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s*[–-]\s*/);

  const start = parseDMY(parts[0]);
  const end = parts.length >= 2 ? parseDMY(parts[1]) : null;

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
    const dateText = $(".singleEventDate h5").first().text();
    return parseExhibitionRange(dateText);
  } catch {
    return { startAt: null, endAt: null };
  }
}

interface ListingCard {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  dateText: string;
  url: string;
}

function parseListingPage(html: string): ListingCard[] {
  const $ = cheerio.load(html);
  const cards: ListingCard[] = [];
  const seen = new Set<string>();

  $(".exhibitionLoop_item").each((_, el) => {
    const $card = $(el);

    const href = $card.find(".title a").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".title h4").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".runningDateTime p").first().text();

    const description =
      $card.find(".excerpt p").first().text().replace(/\s+/g, " ").trim() || null;

    const imgSrc = $card.find("img").first().attr("src") ?? null;
    const imageUrl = imgSrc
      ? imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`
      : null;

    cards.push({ slug, title, description, imageUrl, dateText, url: href });
  });

  return cards;
}

export async function fetchCartwrightHallEvents(): Promise<CartwrightHallRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Cartwright Hall listing error: ${res.status} ${res.statusText}`);

  const cards = parseListingPage(await res.text());

  // Cards with an empty date on the listing (exhibitions) need a detail-page
  // fetch. Cards with a recurring, non-parseable date (e.g. "Every other
  // Sunday") have nothing to fetch — they're dropped below.
  const needsDetail = cards.map((c) => c.dateText.replace(/\s+/g, " ").trim() === "");
  const detailResults = await mapWithConcurrency(
    cards.filter((_, i) => needsDetail[i]),
    DETAIL_FETCH_CONCURRENCY,
    (c) => fetchExhibitionDates(c.url)
  );

  let detailIdx = 0;
  const events: CartwrightHallRawEvent[] = [];
  const now = new Date();

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const { startAt, endAt } = needsDetail[i]
      ? detailResults[detailIdx++]
      : parseCardDateTime(c.dateText);

    if (!startAt) continue; // recurring activity or unparseable — skip

    const endDate = endAt ? new Date(endAt) : null;
    if (endDate && endDate < now) continue;

    events.push({
      slug: c.slug,
      title: c.title,
      description: c.description,
      imageUrl: c.imageUrl,
      startAt,
      endAt,
      // All Bradford District Museums & Galleries venues have free entry;
      // no card or detail page for this venue mentions a ticket price.
      isFree: true,
      url: c.url,
    });
  }

  return events;
}

export function normaliseCartwrightHallEvent(raw: CartwrightHallRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Cartwright Hall event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Cartwright Hall Art Gallery",
      sourceType: "cartwright-hall",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "cartwright-hall", id: raw.slug, url: raw.url },
  };
}
