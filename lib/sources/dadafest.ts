import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, mapWithConcurrency } from "./scrape-utils";

// DaDa's year-round "Events Programme" (not the biennial DaDaFest International
// festival itself — that only runs every two years). The listing at
// /events/current/ is genuinely CMS-driven with schema.org Event markup,
// it's just often thin (as few as one live event) between festival editions.
// No structured venue per event — the org's home venue, The Bluecoat, is used
// as a fixed venue, confirmed against the address on live event detail pages.

const BASE_URL = "https://www.dadafest.co.uk";
const LISTING_URL = `${BASE_URL}/events/current/`;
const DETAIL_FETCH_CONCURRENCY = 4;

const VENUE = {
  name: "The Bluecoat",
  address: "School Lane",
  city: "Liverpool",
  region: "Merseyside",
  postcode: "L1 3BX",
  lat: 53.4042,
  lng: -2.9839,
};

export interface DadafestRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function absoluteUrl(path: string | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function fetchEventDetail(url: string): Promise<{
  startAt: string | null;
  endAt: string | null;
  description: string | null;
  isFree: boolean;
}> {
  const empty = { startAt: null, endAt: null, description: null, isFree: false };
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return empty;

    const $ = cheerio.load(await res.text());

    // "2026-09-07T09:30" — ISO local date-time, no timezone designator.
    const startContent = $('meta[itemprop="startDate"]').attr("content") ?? null;
    const endContent = $('meta[itemprop="endDate"]').attr("content") ?? null;
    const start = startContent ? new Date(startContent) : null;
    const end = endContent ? new Date(endContent) : null;
    const startAt = start && !isNaN(start.getTime()) ? start.toISOString() : null;
    const endAt = end && !isNaN(end.getTime()) ? end.toISOString() : null;

    const description =
      $(".event-content")
        .first()
        .find("p")
        .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean)
        .join(" ")
        .trim() || null;

    const isFree = /\bfree\b/i.test($(".event-content").first().text());

    return { startAt, endAt, description, isFree };
  } catch {
    return empty;
  }
}

function parseListingPage(html: string): Array<{
  slug: string;
  title: string;
  imageUrl: string | null;
  url: string;
}> {
  const $ = cheerio.load(html);
  const events: Array<{ slug: string; title: string; imageUrl: string | null; url: string }> = [];

  $(".eventListingEntry").each((_, el) => {
    const $entry = $(el);
    const titleLink = $entry.find(".ProjectInfoTitle").first();
    const title = titleLink.find("h2").first().text().replace(/\s+/g, " ").trim();
    const href = titleLink.attr("href");
    if (!title || !href) return;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const slug = url.replace(/^https?:\/\/[^/]+\/event\//, "").replace(/\/$/, "");
    if (!slug) return;

    const imgSrc = $entry.find('img[itemprop="image"]').first().attr("src");
    const imageUrl = absoluteUrl(imgSrc);

    events.push({ slug, title, imageUrl, url });
  });

  return events;
}

export async function fetchDadafestEvents(): Promise<DadafestRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`DaDaFest listing error: ${res.status} ${res.statusText}`);

  const summaries = parseListingPage(await res.text());
  const details = await mapWithConcurrency(
    summaries,
    DETAIL_FETCH_CONCURRENCY,
    (s) => fetchEventDetail(s.url)
  );

  const now = new Date();

  return summaries
    .map((s, i) => ({
      slug: s.slug,
      title: s.title,
      description: details[i].description,
      imageUrl: s.imageUrl,
      startAt: details[i].startAt,
      endAt: details[i].endAt,
      isFree: details[i].isFree,
      url: s.url,
    }))
    .filter((e) => {
      if (!e.startAt) return false;
      const end = e.endAt ? new Date(e.endAt) : new Date(e.startAt);
      return end >= now;
    });
}

export function normaliseDadafestEvent(raw: DadafestRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`DaDaFest event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "DaDaFest",
      sourceType: "dadafest",
      profileUrl: `${BASE_URL}/events/current/`,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "dadafest", id: raw.slug, url: raw.url },
  };
}
