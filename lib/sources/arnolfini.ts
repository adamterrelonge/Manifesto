import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://arnolfini.org.uk";

const VENUE = {
  name: "Arnolfini",
  address: "16 Narrow Quay",
  city: "Bristol",
  region: "Bristol",
  postcode: "BS1 4QA",
  lat: 51.4497,
  lng: -2.5982,
};

export interface ArnolfiniRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  dateText: string;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

// "09 December 2025 - 15 December 2026"
// "15 January - 17 December 2026"
// "08 August 2026"
// "From 22 July 2024"
function parseArnolfiniDate(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/^From\s+/i, "").trim();
  const parts = clean.split(/\s+[-–]\s+/);
  if (parts.length >= 2) {
    const endDate = parseDMY(parts[parts.length - 1]);
    const startDate = parseDMY(parts[0], endDate?.getFullYear());
    return {
      startAt: startDate ? startDate.toISOString() : null,
      endAt: endDate ? endDate.toISOString() : null,
    };
  }
  const single = parseDMY(clean);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

function parsePage(html: string): ArnolfiniRawEvent[] {
  const $ = cheerio.load(html);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const events: ArnolfiniRawEvent[] = [];

  $("article.card").each((_, el) => {
    (function (node: typeof el) {
      const $card = $(node);

      const $imgLink = $card.find("a.card__image").first();
      const href = $imgLink.attr("href") ?? $card.find("h2 a").first().attr("href") ?? "";
      if (!href) return;

      const slug = href.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "").replace(/^\/whatson\//, "");
      if (!slug) return;

      const title = $card.find("h2 a").first().text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const styleAttr = $imgLink.attr("style") ?? "";
      const imgMatch = styleAttr.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/);
      const imageUrl = imgMatch ? imgMatch[1] : null;

      const dateText = $card.find("p.text-red").first().text().replace(/\s+/g, " ").trim();
      const { startAt, endAt } = parseArnolfiniDate(dateText);

      const endDate = endAt ? new Date(endAt) : null;
      const startDate = startAt ? new Date(startAt) : null;
      const isVisible = endDate
        ? endDate >= now
        : startDate
          ? startDate >= sevenDaysAgo
          : true; // trust listing page for ongoing events with no parseable date
      if (!isVisible) return;

      events.push({
        slug,
        title,
        imageUrl,
        dateText,
        startAt,
        endAt,
        isFree: /\bfree\b/i.test($card.text()),
        url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
      });
    })(el);
  });

  return events;
}

export async function fetchArnolfiniEvents(): Promise<ArnolfiniRawEvent[]> {
  const seen = new Map<string, ArnolfiniRawEvent>();

  for (let page = 1; page <= 3; page++) {
    const url = page === 1 ? `${BASE_URL}/whatson/` : `${BASE_URL}/whatson/page/${page}/`;
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) break;

    const pageEvents = parsePage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const ev of pageEvents) seen.set(ev.slug, ev);
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

export function normaliseArnolfiniEvent(raw: ArnolfiniRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Arnolfini event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Arnolfini",
      sourceType: "arnolfini",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "arnolfini", id: raw.slug, url: raw.url },
  };
}
