import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// NAE runs on WordPress + The Events Calendar. The listing page embeds a
// full Event[] as JSON-LD, so no detail-page fetch is needed. The page also
// carries a separate Yoast SEO `application/ld+json` block (an object with
// an @graph, not an array) — we pick whichever script parses to an array.
// Pagination is plain path-based (/whats-on/list/page/{n}/); the current
// page's data script exposes next_url directly, empty string on the last page.

const BASE_URL = "https://www.nae.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/list/`;
const MAX_PAGES = 6;

const VENUE = {
  name: "New Art Exchange",
  address: "39-41 Gregory Boulevard",
  city: "Nottingham",
  region: "Nottinghamshire",
  postcode: "NG7 6BE",
  lat: 52.966,
  lng: -1.1681,
};

export interface NewArtExchangeRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

interface LdEvent {
  name: string;
  description?: string;
  image?: string;
  url: string;
  startDate?: string;
  endDate?: string;
}

// JSON-LD name/description fields are HTML-escaped (e.g. "&lt;p&gt;...&lt;/p&gt;",
// "&#038;"), so decode entities first to get real markup/text.
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0?38;/g, "&")
    .replace(/&amp;/g, "&");
}

function cleanDescription(raw: string | undefined): string | null {
  if (!raw) return null;
  const html = decodeEntities(raw);
  // Excerpts carry literal backslash-escapes baked into the source content
  // (e.g. "\n", "\'") rather than real control characters — unescape before
  // collapsing whitespace.
  const text = cheerio
    .load(html)("body")
    .text()
    .replace(/\\['"nrt]/g, (m) => (m === "\\n" || m === "\\r" || m === "\\t" ? " " : m[1]))
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function slugFromUrl(url: string): string {
  return url
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/event\//, "")
    .replace(/\/$/, "");
}

async function fetchListingPage(
  url: string
): Promise<{ events: NewArtExchangeRawEvent[]; nextUrl: string | null }> {
  const res = await fetch(url, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`New Art Exchange listing error: ${res.status} ${res.statusText}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  let raw: LdEvent[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    if (raw.length) return;
    const content = $(el).html();
    if (!content) return;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      // ignore malformed script blocks
    }
  });

  const events: NewArtExchangeRawEvent[] = raw
    .filter((e) => e.url && e.startDate)
    .map((e) => {
      const description = cleanDescription(e.description);
      return {
        slug: slugFromUrl(e.url),
        title: decodeEntities(e.name).trim(),
        description,
        imageUrl: e.image ?? null,
        startAt: new Date(e.startDate!).toISOString(),
        endAt: e.endDate ? new Date(e.endDate).toISOString() : null,
        isFree: /\bfree\b/i.test(`${e.name} ${description ?? ""}`),
        url: e.url,
      };
    });

  const dataScript = $('script[data-js="tribe-events-view-data"]').first().html();
  let nextUrl: string | null = null;
  if (dataScript) {
    try {
      const data = JSON.parse(dataScript);
      nextUrl = data.next_url || null;
    } catch {
      nextUrl = null;
    }
  }

  return { events, nextUrl };
}

export async function fetchNewArtExchangeEvents(): Promise<NewArtExchangeRawEvent[]> {
  const events: NewArtExchangeRawEvent[] = [];
  const seen = new Set<string>();
  let url: string | null = LISTING_URL;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const { events: pageEvents, nextUrl } = await fetchListingPage(url);
    for (const e of pageEvents) {
      if (seen.has(e.slug)) continue;
      seen.add(e.slug);
      events.push(e);
    }
    url = nextUrl;
    pages++;
  }

  return events;
}

export function normaliseNewArtExchangeEvent(raw: NewArtExchangeRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`New Art Exchange event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "New Art Exchange",
      sourceType: "new-art-exchange",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "new-art-exchange", id: raw.slug, url: raw.url },
  };
}
