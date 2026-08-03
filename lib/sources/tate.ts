import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, MONTHS } from "./scrape-utils";

const BASE_URL = "https://www.tate.org.uk";
const MAX_PAGES = 8;

const VENUES: Record<string, NormalisedVenue> = {
  "tate-modern": {
    name: "Tate Modern",
    address: "Bankside",
    city: "London",
    region: "Greater London",
    postcode: "SE1 9TG",
    lat: 51.5076,
    lng: -0.0994,
  },
  "tate-britain": {
    name: "Tate Britain",
    address: "Millbank",
    city: "London",
    region: "Greater London",
    postcode: "SW1P 4RG",
    lat: 51.4914,
    lng: -0.1276,
  },
  "tate-liverpool": {
    name: "Tate Liverpool",
    address: "Albert Dock",
    city: "Liverpool",
    region: "Merseyside",
    postcode: "L3 4BB",
    lat: 53.4013,
    lng: -2.9937,
  },
  "tate-st-ives": {
    name: "Tate St Ives",
    address: "Porthmeor Beach",
    city: "St Ives",
    region: "Cornwall",
    postcode: "TR26 1TG",
    lat: 50.2141,
    lng: -5.4845,
  },
};

const EVENT_HREF_RE =
  /^\/whats-on\/(tate-modern|tate-britain|tate-liverpool|tate-st-ives)\/[^/?]+$/;

const MONTH_RE = new RegExp(
  `\\b(${Object.keys(MONTHS)
    .filter((k) => k.length >= 3)
    .join("|")})\\b`,
  "i"
);

export interface TateRawEvent {
  slug: string;
  venueKey: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  dateText: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function parseTateDates(
  text: string
): { startAt: string | null; endAt: string | null } {
  const now = new Date();

  const untilMatch = text.match(/Until\s+(.+)/i);
  if (untilMatch) {
    const end = parseDMY(untilMatch[1]);
    return { startAt: now.toISOString(), endAt: end ? end.toISOString() : null };
  }

  const parts = text.split(/\s*[–—-]\s*/);
  if (parts.length >= 2) {
    const yearMatch = text.match(/(\d{4})/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
    const start = parseDMY(parts[0], year);
    const end = parseDMY(parts[1], year);
    if (start) {
      return { startAt: start.toISOString(), endAt: end ? end.toISOString() : null };
    }
  }

  const single = parseDMY(text);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

function parseListingPage(html: string): TateRawEvent[] {
  const $ = cheerio.load(html);
  const events: TateRawEvent[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(EVENT_HREF_RE);
    if (!m) return;

    const venueKey = m[1];
    const slug = href.replace(/^\/whats-on\/[^/]+\//, "").replace(/\/$/, "");
    const url = `${BASE_URL}${href}`;

    const $card = $(el);
    const title = $card.find("h3").first().text().trim() || $card.text().trim();

    let dateText: string | null = null;
    $card.find("p").each((_, p) => {
      if (dateText) return;
      const t = $(p).text().trim();
      if (/Until/i.test(t) || MONTH_RE.test(t)) dateText = t;
    });

    if (!dateText) {
      $card.closest("article, li, div").find("p, span, time").each((_, p) => {
        if (dateText) return;
        const t = $(p).text().trim();
        if (/Until/i.test(t) || MONTH_RE.test(t)) dateText = t;
      });
    }

    const imageUrl =
      $card.find("img").first().attr("src") ??
      $card.closest("article, li").find("img").first().attr("src") ??
      null;

    const isFree = /\bfree\b/i.test($card.text());

    const { startAt, endAt } = dateText
      ? parseTateDates(dateText)
      : { startAt: null, endAt: null };

    events.push({
      slug,
      venueKey,
      title: title || slug,
      description: null,
      imageUrl: imageUrl ?? null,
      dateText,
      startAt,
      endAt,
      isFree,
      url,
    });
  });

  return events;
}

export async function fetchTateEvents(): Promise<TateRawEvent[]> {
  const seen = new Map<string, TateRawEvent>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${BASE_URL}/whats-on?date_range=from_now&page=${page}`;
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) break;

    const pageEvents = parseListingPage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const ev of pageEvents) seen.set(ev.slug, ev);
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

export function normaliseTateEvent(raw: TateRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Tate event ${raw.slug} has no start date`);

  const venue = VENUES[raw.venueKey] ?? null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: {
      name: venue?.name ?? "Tate",
      sourceType: "tate",
      profileUrl: BASE_URL,
    },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "tate", id: raw.slug, url: raw.url },
  };
}
