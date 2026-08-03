import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import type { Category } from "@/lib/categories";

// The Serpentine has no public events API — this scrapes the server-rendered
// "what's on" listing (WordPress). Confirmed live:
//   - unfiltered /whats-on/ renders a swiper carousel per category (a
//     curated homepage feed, not a full listing — items can be cut off by
//     the carousel's slide count)
//   - filtering by type (?type=exhibitions, ?type=events, ?type=digital,
//     ?type=public-art, ?type=pavilion, ?type=projects) instead renders a
//     flat `.collection` grid with every matching item and no pagination —
//     that's what this scrapes, once per type, deduping by slug across the
//     inevitable overlap (an item can carry more than one type tag).
// Being HTML rather than a versioned API, this is more brittle than the
// other adapters and WILL need updates if Serpentine redesigns the listing.
//
// Dates: every /whats-on/<slug>/ detail page carries a Yoast SEO JSON-LD
// `@graph` with an `@type: "Event"` node giving `startDate`/`endDate` as
// full ISO 8601 with an explicit UTC offset — far more reliable than
// parsing the card's free-text date range, so this is used for both
// one-off timed events and exhibition date ranges alike.

const SERPENTINE_BASE_URL = "https://www.serpentinegalleries.org";
const SERPENTINE_LISTING_PATH = "/whats-on/";
// The filter vocabulary confirmed on the listing page's own <input
// name="type"> options — not every value returns results at any given
// time (e.g. "pavilion" is empty outside the summer Pavilion season).
const SERPENTINE_TYPES = [
  "exhibitions",
  "events",
  "digital",
  "public-art",
  "pavilion",
  "projects",
] as const;
const DETAIL_FETCH_CONCURRENCY = 5;
const REQUEST_HEADERS = {
  // Honest, identifiable UA rather than a generic browser string — same
  // reasoning as lib/sources/barbican.ts.
  "User-Agent": "ManifestoEventsBot/1.0 (+mailto:terrelonge63@googlemail.com)",
};

// Serpentine's own tag vocabulary, confirmed against the "pretitle" labels
// on real teaser cards. Mapped where a clean match exists; left unmapped
// (null) rather than guessed otherwise — "Digital", "Projects", "Resource"
// and "Live" don't map cleanly onto this app's category vocabulary.
const SERPENTINE_CATEGORY_MAP: Record<string, Category> = {
  Exhibitions: "gallery-exhibition",
  "Public Art": "gallery-exhibition",
  Pavilion: "gallery-exhibition",
  Events: "workshop-talk",
};

// The two physical galleries, keyed by the exact Place name Serpentine's
// own JSON-LD uses. Anything else (a named room within one of these
// buildings, "Online", "Offsite") falls back to a North/South guess by
// substring match, or null (no physical venue) if neither matches.
const SERPENTINE_VENUES: Record<string, NormalisedVenue> = {
  "Serpentine North Gallery": {
    name: "Serpentine North Gallery",
    address: "W Carriage Dr",
    city: "London",
    region: "Greater London",
    postcode: "W2 2AR",
    lat: 51.5067,
    lng: -0.1699,
  },
  "Serpentine South Gallery": {
    name: "Serpentine South Gallery",
    address: "Kensington Gardens",
    city: "London",
    region: "Greater London",
    postcode: "W2 3XA",
    lat: 51.5048,
    lng: -0.178,
  },
};

interface SerpentineCardSummary {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  tags: string[];
  isFree: boolean;
}

export interface SerpentineRawEvent extends SerpentineCardSummary {
  startAt: string | null;
  endAt: string | null;
  venueName: string | null;
}

function absoluteUrl(path: string | undefined): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${SERPENTINE_BASE_URL}${path}`;
}

function slugFromUrl(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+|\/+$/g, "");
}

function parseListingPage(html: string): SerpentineCardSummary[] {
  const $ = cheerio.load(html);
  const events: SerpentineCardSummary[] = [];

  $("section.teaser.collection__item").each((_, el) => {
    const card = $(el);

    const href = card.find("h3.teaser__title a.teaser__link").attr("href");
    const url = absoluteUrl(href);
    if (!url) return; // no link means we can't dedupe/attribute this card — skip it

    const title = card.find("h3.teaser__title a.teaser__link").first().text().trim();
    const imageUrl = absoluteUrl(card.find("img.teaser__img").first().attr("src"));
    const tags = card
      .find(".teaser__pretitle a.teaser__link")
      .map((_, tag) => $(tag).text().trim())
      .get()
      .filter(Boolean);
    const isFree = card
      .find(".meta__row--capitalise")
      .text()
      .trim()
      .toLowerCase()
      .includes("free");
    const description = card.find("p.teaser__text").first().text().trim() || null;

    events.push({ id: slugFromUrl(url), title, description, url, imageUrl, tags, isFree });
  });

  return events;
}

async function fetchListingSummaries(): Promise<SerpentineCardSummary[]> {
  const seen = new Map<string, SerpentineCardSummary>();

  for (const type of SERPENTINE_TYPES) {
    const res = await fetch(
      `${SERPENTINE_BASE_URL}${SERPENTINE_LISTING_PATH}?type=${type}`,
      { headers: REQUEST_HEADERS }
    );
    if (!res.ok) {
      throw new Error(`Serpentine listing type=${type} error: ${res.status} ${res.statusText}`);
    }

    for (const event of parseListingPage(await res.text())) {
      seen.set(event.id, event);
    }
  }

  return [...seen.values()];
}

interface EventDetailDates {
  startAt: string | null;
  endAt: string | null;
  venueName: string | null;
}

interface JsonLdEventNode {
  "@type"?: string;
  startDate?: string;
  endDate?: string;
  location?: { name?: string };
}

async function fetchEventDetail(url: string): Promise<EventDetailDates> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return { startAt: null, endAt: null, venueName: null };

    const $ = cheerio.load(await res.text());
    const raw = $('script[type="application/ld+json"]').first().html();
    if (!raw) return { startAt: null, endAt: null, venueName: null };

    const parsed = JSON.parse(raw) as { "@graph"?: JsonLdEventNode[] };
    const eventNode = (parsed["@graph"] ?? []).find((node) => node["@type"] === "Event");

    return {
      startAt: eventNode?.startDate ?? null,
      endAt: eventNode?.endDate ?? null,
      venueName: eventNode?.location?.name ?? null,
    };
  } catch {
    // Isolated to this one event — fetchSerpentineEvents must not abort the
    // whole run because one detail page timed out, 500'd, or had malformed
    // JSON-LD.
    return { startAt: null, endAt: null, venueName: null };
  }
}

// Simple bounded-concurrency map — keeps detail-page fetches from firing
// all at once against Serpentine's server.
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

export async function fetchSerpentineEvents(): Promise<SerpentineRawEvent[]> {
  const summaries = await fetchListingSummaries();
  const dates = await mapWithConcurrency(summaries, DETAIL_FETCH_CONCURRENCY, (s) =>
    fetchEventDetail(s.url)
  );

  return summaries.map((summary, i) => ({ ...summary, ...dates[i] }));
}

// Named galleries fall back to a North/South guess by substring — covers
// named rooms/spaces within a gallery (e.g. "Serpentine South Education
// Space") that aren't in SERPENTINE_VENUES verbatim. Anything else (e.g.
// "Online") has no physical venue.
function resolveVenue(venueName: string | null): NormalisedVenue | null {
  if (!venueName) return null;
  const exact = SERPENTINE_VENUES[venueName];
  if (exact) return exact;

  if (venueName.includes("North")) return { ...SERPENTINE_VENUES["Serpentine North Gallery"], name: venueName };
  if (venueName.includes("South")) return { ...SERPENTINE_VENUES["Serpentine South Gallery"], name: venueName };
  return null;
}

export function normaliseSerpentineEvent(raw: SerpentineRawEvent): NormalisedEvent {
  if (!raw.startAt) {
    throw new Error(`Serpentine event ${raw.id} has no start date`);
  }

  const category = raw.tags.reduce<Category | null>(
    (found, tag) => found ?? SERPENTINE_CATEGORY_MAP[tag] ?? null,
    null
  );

  return {
    title: raw.title || "Untitled event",
    description: raw.description,
    startAt: new Date(raw.startAt).toISOString(),
    endAt: raw.endAt ? new Date(raw.endAt).toISOString() : null,
    venue: resolveVenue(raw.venueName),
    organiser: {
      name: "Serpentine Galleries",
      sourceType: "serpentine",
      profileUrl: SERPENTINE_BASE_URL,
    },
    category,
    isFree: raw.isFree,
    // No structured pricing on either the listing or the JSON-LD beyond a
    // single "offers.price" that's unreliable for paid tiers/concessions —
    // same call as Barbican: isFree is trustworthy, min/max isn't.
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: {
      provider: "serpentine",
      id: raw.id,
      url: raw.url,
    },
  };
}
