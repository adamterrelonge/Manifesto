import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, MONTHS, mapWithConcurrency } from "./scrape-utils";

const BASE_URL = "https://factoryinternational.org";
const LISTING_URL = `${BASE_URL}/whats-on/`;

// Slugs that are category/season pages, not individual events.
const CATEGORY_SLUGS = new Set([
  "gigs", "classical-at-aviva-studios", "summer-factory",
  "family", "accessibility", "education",
]);

export interface FactoryInternationalRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  priceMin: number | null;
  venue: NormalisedVenue | null;
  url: string;
}

// "16 Feb 2027, 7:30 p.m." → Date
function parseFIDate(s: string): Date | null {
  const m = s.match(
    /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s+([ap])\.m\./i
  );
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
  if (month === undefined) return null;
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const ap = m[6].toLowerCase();
  if (ap === "a" && hour === 12) hour = 0;
  if (ap === "p" && hour !== 12) hour += 12;
  return new Date(year, month, day, hour, min, 0);
}

// "The Hall, Aviva Studios, Water Street, Manchester, M3 4JQ" → NormalisedVenue
function parseVenueString(raw: string): NormalisedVenue | null {
  const parts = raw.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];
  const isPostcode = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i.test(last);
  const postcode = isPostcode ? last : null;
  const rest = isPostcode ? parts.slice(0, -1) : parts;

  const city = rest.length > 0 ? rest[rest.length - 1] : null;
  const beforeCity = rest.slice(0, -1);

  const name = beforeCity.length > 0 ? beforeCity[0] : (city ?? raw.trim());
  const address = beforeCity.length > 1 ? beforeCity.slice(1).join(", ") : null;

  return { name, address, city, region: null, postcode, lat: null, lng: null };
}

function decodeHtmlEntities(s: string): string {
  return cheerio.load(`<span>${s}</span>`)("span").text();
}

async function fetchEventSlugs(): Promise<string[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Factory International listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const slugs = new Set<string>();

  $("a[href^='/whats-on/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const slug = href.replace(/^\/whats-on\//, "").replace(/\/$/, "");
    if (slug && !slug.includes("/") && !CATEGORY_SLUGS.has(slug)) {
      slugs.add(slug);
    }
  });

  return [...slugs];
}

async function fetchEventDetail(slug: string): Promise<FactoryInternationalRawEvent | null> {
  const url = `${BASE_URL}/whats-on/${slug}/`;

  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Each performance date has its own JSON-LD block — collect all.
    const ldBlocks: {
      name?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
      location?: { name?: string };
      image?: string | string[];
    }[] = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data?.["@type"] === "Event") ldBlocks.push(data);
      } catch { /* skip malformed */ }
    });

    // Category/collection pages have no Event JSON-LD — skip them.
    if (ldBlocks.length === 0) return null;

    const first = ldBlocks[0];
    const last = ldBlocks[ldBlocks.length - 1];

    const rawTitle = first.name ?? slug;
    // Strip " | Aviva Studios | Manchester" suffix
    const title = decodeHtmlEntities(rawTitle.split(" | ")[0].trim());

    const description =
      first.description ??
      $("meta[name='description']").attr("content") ??
      $("meta[property='og:description']").attr("content") ??
      null;

    const startAt = first.startDate
      ? (parseFIDate(first.startDate)?.toISOString() ?? null)
      : null;
    const endAt = last.endDate
      ? (parseFIDate(last.endDate)?.toISOString() ?? null)
      : null;

    const imgRaw = first.image;
    const imageUrl = Array.isArray(imgRaw) ? (imgRaw[0] ?? null) : (imgRaw ?? null);

    const venue = first.location?.name
      ? parseVenueString(first.location.name)
      : null;

    const bodyText = $("body").text();
    const priceMatch = bodyText.match(/£(\d+(?:\.\d{2})?)/);
    const isFree = /\bfree\b/i.test(bodyText);
    const priceMin = priceMatch ? parseFloat(priceMatch[1]) : null;

    return { slug, title, description, imageUrl, startAt, endAt, isFree, priceMin, venue, url };
  } catch {
    return null;
  }
}

export async function fetchFactoryInternationalEvents(): Promise<FactoryInternationalRawEvent[]> {
  const slugs = await fetchEventSlugs();
  const results = await mapWithConcurrency(slugs, 3, fetchEventDetail);
  return results.filter(
    (r): r is FactoryInternationalRawEvent => r !== null && r.startAt !== null
  );
}

export function normaliseFactoryInternationalEvent(
  raw: FactoryInternationalRawEvent
): NormalisedEvent {
  if (!raw.startAt)
    throw new Error(`Factory International event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: raw.venue,
    organiser: {
      name: "Factory International",
      sourceType: "factory-international",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: raw.priceMin,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "factory-international", id: raw.slug, url: raw.url },
  };
}
