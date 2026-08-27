import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Glasgow (University of Glasgow). robots.txt is permissive for this path
// (the university's blanket disallows are all elsewhere, e.g. /development/,
// /timetable/ — /hunterian/ is untouched). /hunterian/visit/whats-on/ is a
// T4 CMS tile listing, `div.tileContainer.event`, already filtered to
// "Categories: Hunterian" on every card (confirmed: 13/13 cards) — no
// separate per-venue filtering needed.
//
// Card shape:
//   <div class="... tileContainer event" data-cat="24">
//     <div class="image tileImage"><a href="index.html/event/ID"><img></a></div>
//     <a href="index.html/event/ID">
//       <div class="container tileText">
//         <h2>Title</h2>
//         <p class="event-date universityblue">07 Jan</p>          (no year — not used)
//         <p><strong>Date:</strong> Wednesday 07 January 2026 - Wednesday
//            02 December 2026<br><strong>Time:</strong> ...<br>
//            <strong>Categories:</strong> Hunterian <br>
//            <strong>Venue:</strong> ...<br></p>
//         <p>Description...</p>
//       </div>
//     </a>
//   </div>
// The embedded "Date:" line (with year) is used, not the separate
// day/month-only `.event-date` teaser. `href` is a CMS-relative
// "index.html/event/ID" path — resolved against the listing URL.

const BASE_URL = "https://www.gla.ac.uk";
const LISTING_URL = `${BASE_URL}/hunterian/visit/whats-on/`;

const VENUE = {
  name: "Hunterian Art Gallery",
  address: "82 Hillhead Street",
  city: "Glasgow",
  region: "Glasgow City",
  postcode: "G12 8QQ",
  lat: 55.871746,
  lng: -4.288345,
};

export interface HunterianRawEvent {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

// "Wednesday 07 January 2026 - Wednesday 02 December 2026"
function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*-\s*/);
  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function idFromHref(href: string): string | null {
  const m = href.match(/event\/(\d+)/);
  return m ? m[1] : null;
}

function parseListingPage(html: string): HunterianRawEvent[] {
  const $ = cheerio.load(html);
  const events: HunterianRawEvent[] = [];
  const seen = new Set<string>();

  $("div.tileContainer.event").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    const id = idFromHref(href);
    if (!id || seen.has(id)) return;
    seen.add(id);

    const title = $card.find("h2").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    // The metadata <p> starts with a bold "Date:" label — find it by content
    // rather than position, since sibling <p> order isn't guaranteed stable.
    let dateAt = { startAt: null as string | null, endAt: null as string | null };
    let description: string | null = null;
    $card.find(".tileText > p").each((_, p) => {
      const $p = $(p);
      const text = $p.text().replace(/\s+/g, " ").trim();
      if (/^Date:/.test(text)) {
        const dateText = text.replace(/^Date:\s*/, "").split(/Time:|Categories:|Venue:/)[0];
        dateAt = parseDateRange(dateText);
      } else if (!$p.hasClass("event-date") && !description && text) {
        description = text;
      }
    });
    if (!dateAt.startAt) return;

    const img = $card.find("img").first().attr("src") ?? null;

    events.push({
      id,
      title,
      description,
      imageUrl: img,
      startAt: dateAt.startAt,
      endAt: dateAt.endAt,
      url: new URL(href, LISTING_URL).toString(),
    });
  });

  return events;
}

export async function fetchHunterianEvents(): Promise<HunterianRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Hunterian listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseHunterianEvent(raw: HunterianRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Hunterian event ${raw.id} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "The Hunterian", sourceType: "hunterian", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "hunterian", id: raw.id, url: raw.url },
  };
}
