import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// National Museum Cardiff (Amgueddfa Cymru / National Museum Wales). No
// robots.txt file at all (permissive by default). /cardiff/whatson/ returns
// a clean 200, server-rendered, unpaginated (22 cards), already filtered to
// this site via the URL path. Card shape:
//   <a class="events_list_event" href="/cardiff/whatson/ID/SLUG/">
//     <div class="events_list_media"><picture><source srcset="..."></picture></div>
//     <div class="events_list_details">
//       <h3 class="event_list_title">
//         <span class="events_list_type">Event</span>
//         <span class="events_list_title">Title</span>
//       </h3>
//       <div class="events_list_fields">
//         <div class="events_list_date"><span class="events_list_date_text">
//           <span class="icon-calendar"></span> From 1 July 2025
//         </span></div>
//       </div>
//     </div>
//   </a>
// Dates are free text in several shapes, only some of them reliably
// parseable:
//   "From 1 July 2025"                    -> start = that date, no end
//   "21 July–31 August 2026"              -> real range, both sides parsed
//   "Last Friday of each month"           -> recurring, no single date — skip
//   "Multiple dates available"            -> no date at all — skip
//   "1st August, 29th August, ..."        -> list of ordinal dates, not a
//                                             range — skip (ordinal suffixes
//                                             are deliberately NOT stripped
//                                             here, unlike some other
//                                             adapters, so parseDMY safely
//                                             fails to match "1st"/"29th"
//                                             instead of guessing one date)
//   "Tuesday to Friday until 31 August"   -> recurring window, no dash — skip
// Only "From X" and an explicit dash-separated range are parsed; anything
// else is left null/null and dropped by the caller.

const BASE_URL = "https://museum.wales";
const LISTING_URL = `${BASE_URL}/cardiff/whatson/`;

const VENUE = {
  name: "National Museum Cardiff",
  address: "Cathays Park",
  city: "Cardiff",
  region: "South Glamorgan",
  postcode: "CF10 3NP",
  lat: 51.485631,
  lng: -3.177225,
};

export interface NationalMuseumCardiffRawEvent {
  slug: string;
  title: string;
  tag: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const fromMatch = clean.match(/^From\s+(.+)$/i);
  if (fromMatch) {
    const start = parseDMY(fromMatch[1]);
    return start ? { startAt: start.toISOString(), endAt: null } : { startAt: null, endAt: null };
  }

  if (!/[–—-]/.test(clean)) {
    return { startAt: null, endAt: null };
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

function parseListingPage(html: string): NationalMuseumCardiffRawEvent[] {
  const $ = cheerio.load(html);
  const events: NationalMuseumCardiffRawEvent[] = [];
  const seen = new Set<string>();

  $("a.events_list_event").each((_, el) => {
    const $card = $(el);

    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".events_list_title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".events_list_date_text").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const tag = $card.find(".events_list_type").first().text().replace(/\s+/g, " ").trim().toLowerCase() || null;
    const isFree = /\bfree\b/i.test($card.find(".events_list_field").text());

    const srcset = $card.find(".events_list_media source").first().attr("srcset") ?? "";
    const imgPath = srcset.split(/\s+/)[0] || null;
    const imageUrl = imgPath ? (imgPath.startsWith("http") ? imgPath : `${BASE_URL}${imgPath}`) : null;

    events.push({
      slug,
      title,
      tag,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchNationalMuseumCardiffEvents(): Promise<NationalMuseumCardiffRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`National Museum Cardiff listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseNationalMuseumCardiffEvent(
  raw: NationalMuseumCardiffRawEvent
): NormalisedEvent {
  if (!raw.startAt) throw new Error(`National Museum Cardiff event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "National Museum Cardiff",
      sourceType: "national-museum-cardiff",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "national-museum-cardiff", id: raw.slug, url: raw.url },
  };
}
