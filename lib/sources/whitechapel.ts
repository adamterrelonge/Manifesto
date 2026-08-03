import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://www.whitechapelgallery.org";
// ?month=N is a relative offset (1 = next month). Cover 8 months ahead.
const MONTH_OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7];

const VENUE = {
  name: "Whitechapel Gallery",
  address: "77-82 Whitechapel High Street",
  city: "London",
  region: "Greater London",
  postcode: "E1 7QX",
  lat: 51.5151,
  lng: -0.0724,
};

const MONTH_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*/i;

export interface WhitechapelRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const yearMatch = text.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const parts = text.split(/\s*[–—-]\s*/);
  if (parts.length >= 2) {
    const start = parseDMY(parts[0], year);
    const end = parseDMY(parts[1], year);
    if (start) {
      return { startAt: start.toISOString(), endAt: end ? end.toISOString() : null };
    }
  }

  const single = parseDMY(text, year);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

function parseListingPage(html: string): WhitechapelRawEvent[] {
  const $ = cheerio.load(html);
  const events: WhitechapelRawEvent[] = [];

  $("a[href*='/events/']").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href || href.endsWith("/events/")) return;

    const slug = href.replace(/^\/+|\/+$/g, "");
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const title = $card.find("h3").first().text().trim();
    if (!title) return;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    let dateText: string | null = null;
    $card.find("p, span").each((_, p) => {
      if (dateText) return;
      const t = $(p).text().trim();
      if (MONTH_RE.test(t)) dateText = t;
    });

    if (!dateText) {
      $card.closest("article, li, div").find("p, span, time").each((_, p) => {
        if (dateText) return;
        const t = $(p).text().trim();
        if (MONTH_RE.test(t)) dateText = t;
      });
    }

    const { startAt, endAt } = dateText
      ? parseDateRange(dateText)
      : { startAt: null, endAt: null };

    const isFree = /\bfree\b/i.test($card.text());
    const description =
      $card.find("p").filter((_, p) => !MONTH_RE.test($(p).text())).first().text().trim() || null;

    events.push({ slug, title, description, imageUrl, startAt, endAt, isFree, url });
  });

  return events;
}

export async function fetchWhitechapelEvents(): Promise<WhitechapelRawEvent[]> {
  const seen = new Map<string, WhitechapelRawEvent>();

  const urls = [
    `${BASE_URL}/events/`,
    ...MONTH_OFFSETS.slice(1).map((n) => `${BASE_URL}/events-2-2/?month=${n}`),
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: REQUEST_HEADERS });
      if (!res.ok) continue;

      for (const ev of parseListingPage(await res.text())) {
        if (!seen.has(ev.slug)) seen.set(ev.slug, ev);
      }
    } catch {
      continue;
    }
  }

  return [...seen.values()];
}

export function normaliseWhitechapelEvent(raw: WhitechapelRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Whitechapel event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Whitechapel Gallery", sourceType: "whitechapel", profileUrl: BASE_URL },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "whitechapel", id: raw.slug, url: raw.url },
  };
}
