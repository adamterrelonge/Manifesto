import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";

// The Barbican has no public events API — this scrapes the server-rendered
// "what's on" listing (Drupal Views). Confirmed live:
//   - card markup: div.search-listing.search-listing--event
//   - pagination: classic Views pager fallback at ?page=N (0-indexed) still
//     works even though the live site enhances it with infinite scroll —
//     see https://www.barbican.org.uk/whats-on?page=1
//   - Barbican's own frontend also calls an unauthenticated Spektrix API
//     (spektrix.barbican.org.uk/.../api/v3/events) for ticketing metadata,
//     but it has no public-facing event URL or marketing description, so
//     it can't stand in for this HTML listing — only the CMS listing has
//     the fields NormalisedEvent needs (title, description, url, image).
// Being HTML rather than a versioned API, this is more brittle than the
// other adapters and WILL need selector updates if Barbican redesigns
// the listing.
//
// Dates come from each event's detail page, not the listing card: listing
// cards only carry a <time> for one-off timed events (talks, screenings),
// and even then it's the *next upcoming instance*, not the full run — a
// multi-month exhibition's listing card has an empty date div entirely.
// Every detail page (checked across a one-off talk, a long exhibition, and
// a recurring workshop) instead has exactly one `.event-byline__date` with
// a start/end date-range, which is what's used here for both timed events
// and exhibitions alike.

const BARBICAN_BASE_URL = "https://www.barbican.org.uk";
const BARBICAN_LIST_PATH = "/whats-on";
const MAX_PAGES = 20;
const DETAIL_FETCH_CONCURRENCY = 5;
const REQUEST_HEADERS = {
  // Honest, identifiable UA — the Barbican's robots.txt disallows
  // AI-crawler user agents (ClaudeBot/GPTBot/etc) via Cloudflare's managed
  // bot list, so this deliberately doesn't claim to be one.
  "User-Agent": "ManifestoEventsBot/1.0 (+mailto:terrelonge63@googlemail.com)",
};

// Barbican's own tag vocabulary, confirmed against the "tags" filter on
// /whats-on. Mapped to the app's Category type where a clean match exists;
// left unmapped (null) rather than guessed for tags with no equivalent.
const BARBICAN_CATEGORY_MAP: Record<string, Category> = {
  "Art & design": "gallery-exhibition",
  Cinema: "film",
  "Classical music": "music",
  "Contemporary music": "music",
  "Theatre & dance": "theatre-performance",
  "Talks & events": "workshop-talk",
  "Take part": "workshop-talk",
};

// The listing has no per-event venue — every event on this page happens at
// the Barbican Centre itself, so it's hardcoded rather than scraped.
const BARBICAN_VENUE = {
  name: "Barbican Centre",
  address: "Silk Street",
  city: "London",
  region: "Greater London",
  postcode: "EC2Y 8DS",
  lat: 51.5202,
  lng: -0.0937,
};

interface BarbicanCardSummary {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  tags: string[];
  isFree: boolean;
}

export interface BarbicanRawEvent extends BarbicanCardSummary {
  startAt: string | null;
  endAt: string | null;
  venueName: string | null;
}

function absoluteUrl(path: string | undefined): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${BARBICAN_BASE_URL}${path}`;
}

function parseListingPage(html: string): BarbicanCardSummary[] {
  const $ = cheerio.load(html);
  const events: BarbicanCardSummary[] = [];

  $(".search-listing.search-listing--event").each((_, el) => {
    const card = $(el);

    const href = card.find("a.search-listing__link").attr("href");
    const url = absoluteUrl(href);
    if (!url) return; // no link means we can't dedupe/attribute this card — skip it

    // Slug is stable and unique per event, unlike array position.
    const id = href!.replace(/^\/+|\/+$/g, "");

    const title = card.find("h2.listing-title").first().text().trim();
    const imageUrl = absoluteUrl(card.find("img").first().attr("src"));
    const tags = card
      .find(".tags .tag__plain")
      .map((_, tag) => $(tag).text().trim())
      .get()
      .filter(Boolean);
    const isFree = card
      .find(".search-listing__label--promoted")
      .text()
      .trim()
      .toLowerCase()
      .includes("free");
    const description =
      card.find(".search-listing__intro p:not(.listing-time-wrapper)").first().text().trim() ||
      null;

    events.push({ id, title, description, url, imageUrl, tags, isFree });
  });

  return events;
}

async function fetchListingSummaries(): Promise<BarbicanCardSummary[]> {
  const seen = new Map<string, BarbicanCardSummary>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${BARBICAN_BASE_URL}${BARBICAN_LIST_PATH}?page=${page}`, {
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) {
      throw new Error(`Barbican listing page ${page} error: ${res.status} ${res.statusText}`);
    }

    const pageEvents = parseListingPage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const event of pageEvents) seen.set(event.id, event);
    // Views' pager falls back to repeating the last page once N exceeds the
    // real page count — stop once a page adds nothing new rather than
    // trusting an empty-array result to ever come back.
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

interface EventDetailDates {
  startAt: string | null;
  endAt: string | null;
  venueName: string | null;
}

async function fetchEventDetail(url: string): Promise<EventDetailDates> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return { startAt: null, endAt: null, venueName: null };

    const $ = cheerio.load(await res.text());
    const times = $(".event-byline__date time[datetime]")
      .map((_, t) => $(t).attr("datetime"))
      .get()
      .filter((d): d is string => Boolean(d));
    const venueName = $(".event-byline__venue").first().text().trim() || null;

    return {
      startAt: times[0] ?? null,
      // A single <time> means a one-day event with no range to speak of.
      endAt: times.length > 1 ? times[times.length - 1] : null,
      venueName,
    };
  } catch {
    // Isolated to this one event — fetchBarbicanEvents must not abort the
    // whole run because one detail page timed out or 500'd.
    return { startAt: null, endAt: null, venueName: null };
  }
}

// Simple bounded-concurrency map — keeps ~200 detail-page fetches per run
// from firing all at once against the Barbican's server.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

export async function fetchBarbicanEvents(): Promise<BarbicanRawEvent[]> {
  const summaries = await fetchListingSummaries();
  const dates = await mapWithConcurrency(summaries, DETAIL_FETCH_CONCURRENCY, (s) =>
    fetchEventDetail(s.url)
  );

  return summaries.map((summary, i) => ({ ...summary, ...dates[i] }));
}

export function normaliseBarbicanEvent(raw: BarbicanRawEvent): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`Barbican event ${raw.id} has no start date`);
  }

  const category = raw.tags.reduce<Category | null>(
    (found, tag) => found ?? BARBICAN_CATEGORY_MAP[tag] ?? null,
    null
  );

  return {
    title: raw.title || "Untitled event",
    description: raw.description,
    startAt: new Date(raw.startAt).toISOString(),
    endAt: raw.endAt ? new Date(raw.endAt).toISOString() : null,
    // Most events are just "Barbican Centre", but some detail pages name a
    // specific room (e.g. "Barbican Music Library") — prefer that when present.
    venue: raw.venueName ? { ...BARBICAN_VENUE, name: raw.venueName } : BARBICAN_VENUE,
    organiser: {
      name: "Barbican Centre",
      sourceType: "barbican",
      profileUrl: BARBICAN_BASE_URL,
    },
    category,
    isFree: raw.isFree,
    // Ticket pricing lives behind Spektrix, not the listing page.
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: {
      provider: "barbican",
      id: raw.id,
      url: raw.url,
    },
  };
}
