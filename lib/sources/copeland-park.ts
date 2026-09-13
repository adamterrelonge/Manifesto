import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, applyTime } from "./scrape-utils";

// Copeland Park & Bussey Building, Peckham — a multi-space creative complex
// (Copeland Gallery, UNIT/08, CLF Art Cafe, etc, all under one roof/postcode)
// rather than a single gallery. Its own FacetWP-driven `/events/` listing IS
// server-rendered on first load (not AJAX-only) — confirmed real cards in
// the raw HTML — but a "Load more"/facetwp-pager control is present, so only
// the first ~40 cards are read here; deeper pages aren't fetched, same
// "note the limitation, ship what's reachable on one request" convention as
// street-level-photoworks.ts. Built as a stand-in for "Market Root" (a
// recurring market series hosted here) since Market Root itself has no own
// website — only an Instagram account and per-event Eventbrite listings, no
// stable listing page to scrape. This picks up Market Root's markets
// whenever scheduled here, plus the venue's broader regular programme.
//
// Sub-venue names (`.venue_title`, e.g. "Copeland Gallery", "UNIT/08") are
// just different spaces within the one complex/postcode, so one shared
// NormalisedVenue is used for all cards, with the sub-venue folded into the
// description instead of treated as a separate physical venue.
//
// Card date lives in a `title` HTML attribute, not the visible text — the
// visible `.date`/`.times` divs omit the year:
//   <div class="etimes" data-toggle="tooltip" title="Tue 8th Sep 2026 @ 19:00&ndash;23:00">
// Ordinal suffixes ("8th") are stripped before parseDMY; the time after "@"
// is applied to the parsed date via applyTime for a real start time.

const BASE_URL = "https://www.copelandpark.com";
const LISTING_URL = `${BASE_URL}/events/`;

const VENUE = {
  name: "Copeland Park & Bussey Building",
  address: "133 Rye Lane",
  city: "London",
  region: "Greater London",
  postcode: "SE15 4ST",
  lat: 51.4694,
  lng: -0.0657,
};

export interface CopelandParkRawEvent {
  id: string;
  title: string;
  description: string | null;
  venueTitle: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
  url: string;
}

// "Tue 8th Sep 2026 @ 19:00–23:00" -> { date: "Tue 8 Sep 2026", time: "19:00" }
function parseCopelandParkDate(titleAttr: string): Date | null {
  const clean = titleAttr.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1").replace(/\s+/g, " ").trim();
  const [datePart, timePart] = clean.split("@").map((s) => s.trim());
  const date = parseDMY(datePart);
  if (!date) return null;

  const startTime = timePart?.split(/[–—-]/)[0]?.trim();
  return startTime ? applyTime(date, startTime) : date;
}

function slugAndTicketFromUrl(url: string): { id: string; url: string } {
  try {
    const u = new URL(url);
    const pathId = u.pathname.replace(/^\/+|\/+$/g, ""); // "events/40122/colors-tones-of-london"
    const ticket = u.searchParams.get("t");
    return { id: ticket ? `${pathId}-${ticket}` : pathId, url: u.toString() };
  } catch {
    return { id: url.replace(/^\/+|\/+$/g, ""), url };
  }
}

function parseListingPage(html: string): CopelandParkRawEvent[] {
  const $ = cheerio.load(html);
  const events: CopelandParkRawEvent[] = [];
  const seen = new Set<string>();

  $("div.event.row").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a.row-inner").first().attr("href") ?? "";
    if (!href) return;
    const { id, url } = slugAndTicketFromUrl(href);
    if (!id || seen.has(id)) return;
    seen.add(id);

    const title = $card.find(".title-text h3 span").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const titleAttr = $card.find(".etimes").first().attr("title") ?? "";
    const start = titleAttr ? parseCopelandParkDate(titleAttr) : null;
    if (!start) return;

    const description =
      $card.find(".excerpt").first().text().replace(/\s+/g, " ").trim() || null;
    const venueTitle =
      $card.find(".venue_title").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find(".event-image img").first().attr("src") ?? null;
    const isFree = $card.find(".free_event").length > 0;

    events.push({
      id,
      title,
      description,
      venueTitle,
      imageUrl,
      isFree,
      startAt: start.toISOString(),
      url,
    });
  });

  return events;
}

export async function fetchCopelandParkEvents(): Promise<CopelandParkRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Copeland Park listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseCopelandParkEvent(raw: CopelandParkRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Copeland Park event ${raw.id} has no start date`);

  const description = raw.venueTitle
    ? [`Venue: ${raw.venueTitle}`, raw.description].filter(Boolean).join(" — ")
    : raw.description;

  return {
    title: raw.title,
    description,
    startAt: raw.startAt,
    endAt: null,
    venue: VENUE,
    organiser: {
      name: "Copeland Park & Bussey Building",
      sourceType: "copeland-park",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "copeland-park", id: raw.id, url: raw.url },
  };
}
