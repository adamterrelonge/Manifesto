import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, parseDayRange } from "./scrape-utils";

// Sadler's Wells — a two-venue umbrella (the original Islington theatre
// plus Sadler's Wells East, which opened at Queen Elizabeth Olympic Park
// in Jan 2025). One listing page carries both: each `.c-event-card` names
// its own venue in `.c-event-card__location` text, mapped below to a real
// address since the card itself carries no postcode/coordinates. Dates are
// clean server-rendered "D – D Month YYYY" text, no JSON-LD needed.

const BASE_URL = "https://www.sadlerswells.com";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE_BY_LOCATION: Record<string, NormalisedVenue> = {
  "Sadler's Wells Theatre": {
    name: "Sadler's Wells Theatre",
    address: "Rosebery Avenue",
    city: "London",
    region: "Greater London",
    postcode: "EC1R 4TN",
    lat: null,
    lng: null,
  },
  "Sadler's Wells East": {
    name: "Sadler's Wells East",
    address: "101 Carpenters Road, Queen Elizabeth Olympic Park",
    city: "London",
    region: "Greater London",
    postcode: "E20 2AR",
    lat: null,
    lng: null,
  },
};

function resolveVenue(locationText: string | null): NormalisedVenue {
  if (locationText && VENUE_BY_LOCATION[locationText]) return VENUE_BY_LOCATION[locationText];
  return {
    name: locationText || "Sadler's Wells",
    address: null,
    city: "London",
    region: "Greater London",
    postcode: null,
    lat: null,
    lng: null,
  };
}

// data-srcset entries are "<url> <width>w", comma-separated — pick the
// widest since the plain `src` is a tiny lazyload placeholder.
function bestFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; width: number } | null = null;
  for (const entry of srcset.split(",")) {
    const m = entry.trim().match(/^(\S+)\s+(\d+)w$/);
    if (!m) continue;
    const width = parseInt(m[2], 10);
    if (!best || width > best.width) best = { url: m[1], width };
  }
  return best?.url ?? null;
}

export interface SadlersWellsRawEvent {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  locationText: string | null;
  url: string;
}

export async function fetchSadlersWellsEvents(): Promise<SadlersWellsRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Sadler's Wells listing error: ${res.status} ${res.statusText}`);

  const $ = cheerio.load(await res.text());
  const events: SadlersWellsRawEvent[] = [];

  $(".c-event-card").each((_, el) => {
    const $card = $(el);

    const title = $card.find(".c-event-card__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const href = $card.find(".c-event-card__cover-link").first().attr("href") ?? "";
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const slugMatch = url.match(/\/whats-on\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1] : title.toLowerCase().replace(/\s+/g, "-");

    const dateText = $card.find("time.c-event-card__daterange").first().text().replace(/\s+/g, " ").trim();
    const { startAt, endAt } = parseDayRange(dateText);
    if (!startAt) return;

    const locationText =
      $card.find(".c-event-card__location").first().text().replace(/\s+/g, " ").trim() || null;

    const img = $card.find("img").first();
    const imageUrl = bestFromSrcset(img.attr("data-srcset")) ?? img.attr("src") ?? null;

    // Multiple cards can share the same show (different venue/date, e.g.
    // Alvin Ailey's free "New Works" preview at Sadler's Wells East vs the
    // ticketed run at Sadler's Wells Theatre) — id includes the date so
    // each stays distinct rather than overwriting.
    events.push({
      id: `${slug}-${startAt.toISOString().slice(0, 10)}`,
      title,
      description: null,
      imageUrl,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      locationText,
      url,
    });
  });

  return events;
}

export function normaliseSadlersWellsEvent(raw: SadlersWellsRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Sadler's Wells event ${raw.id} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: resolveVenue(raw.locationText),
    organiser: { name: "Sadler's Wells", sourceType: "sadlers-wells", profileUrl: BASE_URL },
    category: "theatre-performance",
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "sadlers-wells", id: raw.id, url: raw.url },
  };
}
