import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Fitzwilliam Museum (University of Cambridge). `/plan-your-visit/exhibitions`
// is a server-rendered, unpaginated grid of `div.card` cards. Each card's
// `.text-dark` paragraph is either a single "opens on" date with no end
// (most exhibitions here run open-ended/until further notice, so a bare
// start with no end is normal, not a parsing gap) or an explicit
// "X to Y" range.

const BASE_URL = "https://fitzmuseum.cam.ac.uk";
const LISTING_URL = `${BASE_URL}/plan-your-visit/exhibitions`;

const VENUE = {
  name: "The Fitzwilliam Museum",
  address: "Trumpington Street",
  city: "Cambridge",
  region: "Cambridgeshire",
  postcode: "CB2 1RB",
  lat: 52.1998,
  lng: 0.1176,
};

export interface FitzwilliamMuseumRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s+to\s+/i);
  const start = parseDMY(parts[0]);
  const end = parts.length > 1 ? parseDMY(parts[1]) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): FitzwilliamMuseumRawEvent[] {
  const $ = cheerio.load(html);
  const events: FitzwilliamMuseumRawEvent[] = [];
  const seen = new Set<string>();

  $("div.card").each((_, el) => {
    const $card = $(el);

    const $link = $card.find(".card__link").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $link.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".text-dark").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const imageUrl = $card.find(".card__image img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchFitzwilliamMuseumEvents(): Promise<FitzwilliamMuseumRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Fitzwilliam Museum listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseFitzwilliamMuseumEvent(raw: FitzwilliamMuseumRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "The Fitzwilliam Museum", sourceType: "fitzwilliam-museum", profileUrl: LISTING_URL },
    category: null,
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "fitzwilliam-museum", id: raw.slug, url: raw.url },
  };
}
