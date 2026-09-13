import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDayRange, mapWithConcurrency } from "./scrape-utils";

// The Yard Theatre — Hackney Wick. A Next.js app with no server-rendered
// dates anywhere in its React Server Component flight stream (confirmed
// live — no __NEXT_DATA__, no JSON-LD, no plain date text on either the
// homepage or a show's own /events/<slug> page). The one place dates *do*
// render as plain HTML is the Spektrix ticketing widget's wrapper page at
// /events/<slug>/tickets/<CODE> — a <h4> holding the full run's date range
// (e.g. "2 September - 17 October 2026", one date per whole run, not per
// performance). The homepage conveniently links directly to that exact
// URL for every currently-showing production, so no separate slug/code
// discovery step is needed.

const BASE_URL = "https://www.theyardtheatre.co.uk";

const VENUE = {
  name: "The Yard Theatre",
  address: "Unit 2a, Queen's Yard, White Post Lane",
  city: "London",
  region: "Greater London",
  postcode: "E9 5EN",
  lat: null as number | null,
  lng: null as number | null,
};

const TICKET_LINK_RE = /^\/events\/([^/?#]+)\/tickets\/([^/?#]+)/;

export interface YardTheatreRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

async function fetchShowPage(
  slug: string,
  code: string
): Promise<YardTheatreRawEvent | null> {
  const url = `${BASE_URL}/events/${slug}/tickets/${code}`;
  const res = await fetch(url, { headers: REQUEST_HEADERS });
  if (!res.ok) return null;

  const $ = cheerio.load(await res.text());
  const title = $("h2").first().text().replace(/\s+/g, " ").trim();
  if (!title) return null;

  const dateText = $("h4").first().text().replace(/\s+/g, " ").trim();
  const { startAt, endAt } = parseDayRange(dateText);
  if (!startAt) return null;

  const imageUrl = $('meta[property="og:image"]').attr("content") ?? null;

  return {
    slug,
    title,
    imageUrl,
    startAt: startAt.toISOString(),
    endAt: endAt ? endAt.toISOString() : null,
    url: `${BASE_URL}/events/${slug}`,
  };
}

export async function fetchYardTheatreEvents(): Promise<YardTheatreRawEvent[]> {
  const res = await fetch(`${BASE_URL}/`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Yard Theatre homepage error: ${res.status} ${res.statusText}`);

  const $ = cheerio.load(await res.text());
  const pairs = new Map<string, string>(); // slug -> ticket code

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(TICKET_LINK_RE);
    if (m && !pairs.has(m[1])) pairs.set(m[1], m[2]);
  });

  const results = await mapWithConcurrency(
    [...pairs.entries()],
    3,
    ([slug, code]) => fetchShowPage(slug, code)
  );

  return results.filter((e): e is YardTheatreRawEvent => e !== null);
}

export function normaliseYardTheatreEvent(raw: YardTheatreRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Yard Theatre event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "The Yard Theatre", sourceType: "yard-theatre", profileUrl: BASE_URL },
    category: "theatre-performance",
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "yard-theatre", id: raw.slug, url: raw.url },
  };
}
