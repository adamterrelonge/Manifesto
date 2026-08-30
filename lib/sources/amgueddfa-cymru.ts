import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Amgueddfa Cymru / National Museum Wales's umbrella `/whatson/` listing
// (same platform/card shape as lib/sources/national-museum-cardiff.ts's
// `/cardiff/whatson/`) covers all 7 sites on one page. Cardiff is filtered
// out here since it already has its own adapter; the other 6 sites' events
// are ingested from this one fetch: St Fagans, National Waterfront Museum
// (Swansea), National Wool Museum (Drefach Felindre), National Roman Legion
// Museum (Caerleon), National Slate Museum (Llanberis), Big Pit National
// Coal Museum (Blaenavon). Same free-text date shapes/parsing rules as
// national-museum-cardiff.ts ("From X" and explicit ranges only).

const BASE_URL = "https://museum.wales";
const LISTING_URL = `${BASE_URL}/whatson/`;

const VENUES: Record<string, NormalisedVenue> = {
  stfagans: {
    name: "St Fagans National Museum of History",
    address: "St Fagans",
    city: "Cardiff",
    region: "South Glamorgan",
    postcode: "CF5 6XB",
    lat: 51.4816,
    lng: -3.2736,
  },
  swansea: {
    name: "National Waterfront Museum",
    address: "Oystermouth Road",
    city: "Swansea",
    region: "West Glamorgan",
    postcode: "SA1 3RD",
    lat: 51.6186,
    lng: -3.9375,
  },
  wool: {
    name: "National Wool Museum",
    address: "Dre-fach Felindre",
    city: "Llandysul",
    region: "Carmarthenshire",
    postcode: "SA44 5UP",
    lat: 52.0083,
    lng: -4.3193,
  },
  roman: {
    name: "National Roman Legion Museum",
    address: "High Street",
    city: "Caerleon, Newport",
    region: "Gwent",
    postcode: "NP18 1AE",
    lat: 51.6215,
    lng: -2.9535,
  },
  slate: {
    name: "National Slate Museum",
    address: "Padarn Country Park",
    city: "Llanberis",
    region: "Gwynedd",
    postcode: "LL55 4TY",
    lat: 53.1197,
    lng: -4.1207,
  },
  bigpit: {
    name: "Big Pit National Coal Museum",
    address: "Blaenavon",
    city: "Blaenavon",
    region: "Torfaen",
    postcode: "NP4 9XP",
    lat: 51.7666,
    lng: -3.0813,
  },
};

export interface AmgueddfaCymruRawEvent {
  slug: string;
  title: string;
  venueKey: string;
  isFree: boolean;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// Same shapes as national-museum-cardiff.ts's parseDateText, plus one more:
// a bare single date with no dash ("22 September 2026") is common on this
// umbrella page for one-off workshops/talks — safe to parse directly since
// a comma or "&" (both signalling a list of several dates, not a range) are
// excluded first.
function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const fromMatch = clean.match(/^From\s+(.+)$/i);
  if (fromMatch) {
    const start = parseDMY(fromMatch[1]);
    return start ? { startAt: start.toISOString(), endAt: null } : { startAt: null, endAt: null };
  }

  if (/[,&]/.test(clean)) {
    return { startAt: null, endAt: null };
  }

  if (!/[–—-]/.test(clean)) {
    const single = parseDMY(clean);
    return single ? { startAt: single.toISOString(), endAt: null } : { startAt: null, endAt: null };
  }

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*[–—-]\s*/);
  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[parts.length - 1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): AmgueddfaCymruRawEvent[] {
  const $ = cheerio.load(html);
  const events: AmgueddfaCymruRawEvent[] = [];
  const seen = new Set<string>();

  $("a.events_list_event").each((_, el) => {
    const $card = $(el);

    const href = $card.attr("href") ?? "";
    if (!href) return;
    const venueKey = href.replace(/^\//, "").split("/")[0];
    if (venueKey === "cardiff" || !VENUES[venueKey]) return;

    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".events_list_title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".events_list_date_text").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const isFree = /\bfree\b/i.test($card.find(".events_list_field").text());

    const srcset = $card.find(".events_list_media source").first().attr("srcset") ?? "";
    const imgPath = srcset.split(/\s+/)[0] || null;
    const imageUrl = imgPath ? (imgPath.startsWith("http") ? imgPath : `${BASE_URL}${imgPath}`) : null;

    events.push({
      slug,
      title,
      venueKey,
      isFree,
      startAt,
      endAt,
      imageUrl,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchAmgueddfaCymruEvents(): Promise<AmgueddfaCymruRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Amgueddfa Cymru listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseAmgueddfaCymruEvent(raw: AmgueddfaCymruRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Amgueddfa Cymru event ${raw.slug} has no start date`);

  const venue = VENUES[raw.venueKey];

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue,
    organiser: {
      name: venue.name,
      sourceType: "amgueddfa-cymru",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "amgueddfa-cymru", id: raw.slug, url: raw.url },
  };
}
