import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, mapWithConcurrency } from "./scrape-utils";

// V&A East listing lives at /east (not /east/whats-on, which 404s).
// Event detail URLs use /event/{alphanumericId}/{slug};
// exhibition detail URLs use /exhibitions/{slug}.
// Neither page type has JSON-LD — dates are plain text only.
// robots.txt at vam.ac.uk does not block ManifestoEventsBot.

const BASE_URL = "https://www.vam.ac.uk";
const LISTING_URL = `${BASE_URL}/east`;
const DETAIL_FETCH_CONCURRENCY = 4;

// Address confirmed from live detail pages (107 Carpenters Rd, E20 2AR).
const VENUES: Record<string, NormalisedVenue> = {
  museum: {
    name: "V&A East Museum",
    address: "107 Carpenters Rd",
    city: "London",
    region: "Greater London",
    postcode: "E20 2AR",
    lat: 51.5413,
    lng: -0.0013,
  },
  storehouse: {
    name: "V&A East Storehouse",
    address: "Here East, Queen Elizabeth Olympic Park",
    city: "London",
    region: "Greater London",
    postcode: "E20 3BS",
    lat: 51.547,
    lng: -0.0234,
  },
};

// Matches /event/{alphanumericId}/{slug} and /exhibitions/{slug}
const EVENT_PATH_RE = /^\/(event\/[A-Za-z0-9]+\/[^/?#]+|exhibitions\/[^/?#]+)$/;

export interface VamEastRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  venueKey: string;
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
  venueKey: string;
}> {
  const empty = { startAt: null, endAt: null, description: null, venueKey: "museum" };
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return empty;

    const $ = cheerio.load(await res.text());
    const bodyText = $("body").text();

    let startAt: string | null = null;
    let endAt: string | null = null;

    // Exhibitions: "Closes Sunday, 10 January 2027"
    // The day-of-week prefix is stripped by parseDMY automatically.
    const closesMatch = bodyText.match(/Closes\s+\w+,\s+(\d{1,2}\s+\w+\s+\d{4})/i);
    if (closesMatch) {
      const end = parseDMY(closesMatch[1]);
      startAt = new Date().toISOString();
      endAt = end ? end.toISOString() : null;
    }

    // Timed events: "Thursday, 23 July 2026" or "23 July 2026"
    if (!startAt) {
      const eventDateMatch = bodyText.match(/\w+,\s+(\d{1,2}\s+\w+\s+\d{4})/);
      if (eventDateMatch) {
        const start = parseDMY(eventDateMatch[1]);
        if (start) startAt = start.toISOString();
      }
    }

    // Venue: default museum, switch if Storehouse mentioned before Museum
    const storehouseIdx = bodyText.toLowerCase().indexOf("storehouse");
    const museumIdx = bodyText.toLowerCase().indexOf("east museum");
    const venueKey =
      storehouseIdx !== -1 && (museumIdx === -1 || storehouseIdx < museumIdx)
        ? "storehouse"
        : "museum";

    const description =
      $('meta[name="description"]').attr("content") ?? null;

    return { startAt, endAt, description, venueKey };
  } catch {
    return empty;
  }
}

function parseListingPage(html: string): Array<{
  slug: string;
  title: string;
  imageUrl: string | null;
  isFree: boolean;
  url: string;
}> {
  const $ = cheerio.load(html);
  const events: Array<{ slug: string; title: string; imageUrl: string | null; isFree: boolean; url: string }> = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!EVENT_PATH_RE.test(href)) return;

    const url = `${BASE_URL}${href}`;
    if (seen.has(href)) return;
    seen.add(href);

    const $card = $(el);
    const title =
      $card.find("h2, h3, h4").first().text().trim() ||
      $card.attr("aria-label") ||
      $card.text().trim().split("\n")[0].trim();

    if (!title || title.length < 3) return;

    const imageEl = $card.find("img").first();
    const imageUrl = absoluteUrl(
      imageEl.attr("src") ?? imageEl.attr("data-src") ?? undefined
    );
    const isFree = /\bfree\b/i.test($card.text());

    events.push({ slug: href, title, imageUrl, isFree, url });
  });

  return events;
}

export async function fetchVamEastEvents(): Promise<VamEastRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`V&A East listing error: ${res.status} ${res.statusText}`);

  const summaries = parseListingPage(await res.text());
  const details = await mapWithConcurrency(
    summaries,
    DETAIL_FETCH_CONCURRENCY,
    (s) => fetchEventDetail(s.url)
  );

  return summaries.map((s, i) => ({
    slug: s.slug,
    title: s.title,
    description: details[i].description,
    imageUrl: s.imageUrl,
    startAt: details[i].startAt,
    endAt: details[i].endAt,
    isFree: s.isFree,
    venueKey: details[i].venueKey,
    url: s.url,
  }));
}

export function normaliseVamEastEvent(raw: VamEastRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`V&A East event ${raw.slug} has no start date`);

  const venue = VENUES[raw.venueKey] ?? VENUES.museum;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: {
      name: "V&A East",
      sourceType: "vam-east",
      profileUrl: `${BASE_URL}/east`,
    },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "vam-east", id: raw.slug, url: raw.url },
  };
}
