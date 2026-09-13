import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// Nicoletti Contemporary, Shoreditch, London. robots.txt permissive (Yoast
// default, no Disallow rules). /exhibitions/ is a server-rendered WordPress
// custom template, no client-side rendering needed. Card shape:
//   <div class="exhibition-item">
//     <a id="id-XXXX" href="...permalink...">
//       <div class="content">
//         <p><em>TITLE</em><p>ARTIST</p><p>LOCATION | "Gallery"/"Institutional"</p></p>
//         <b>DD.MM.YY - DD.MM.YY</b>
//       </div>
//     </a>
//   </div>
//   <div class="exhibition-thumbnail id-XXXX"><img src="..."></div>
// (the invalid nested <p>s get auto-closed by cheerio's HTML parser, so
// `.content p` yields [title-dup, artist, location/tag] in order; `em`
// alone reliably gets the title). The thumbnail image is a SIBLING of the
// card, not nested inside it, matched by the shared id-XXXX class suffix.
// Both date sides always carry a 2-digit year, no year-inference needed.
// A minority of cards are tagged "Institutional" rather than "Gallery" —
// exhibitions physically hosted at a partner museum abroad (seen: Otterndorf
// DE, Zagreb HR), not at the gallery's own London space — skipped rather
// than mis-tagged with the gallery's own address, same rule used for
// off-site cards in street-level-photoworks.ts/henry-moore-institute.ts.

const BASE_URL = "https://nicoletticontemporary.com";
const LISTING_URL = `${BASE_URL}/exhibitions/`;

const VENUE = {
  name: "Nicoletti Contemporary",
  address: "91 Paul Street",
  city: "London",
  region: "Greater London",
  postcode: "EC2A 4NY",
  lat: 51.5262,
  lng: -0.0862,
};

export interface NicolettiContemporaryRawEvent {
  id: string;
  title: string;
  artist: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

// "11.07.26 - 05.09.26" -> ISO start/end (2-digit year, assumed 20YY).
function parseDMYShortYear(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = 2000 + parseInt(m[3], 10);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s*-\s*/);
  if (parts.length !== 2) return { startAt: null, endAt: null };

  const start = parseDMYShortYear(parts[0]);
  const end = parseDMYShortYear(parts[1]);
  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): NicolettiContemporaryRawEvent[] {
  const $ = cheerio.load(html);
  const events: NicolettiContemporaryRawEvent[] = [];
  const seen = new Set<string>();

  $("div.exhibition-item").each((_, el) => {
    const $card = $(el);
    const $link = $card.find("a[id^=id-]").first();
    const id = $link.attr("id");
    const href = $link.attr("href") ?? "";
    if (!id || !href || seen.has(id)) return;
    seen.add(id);

    const title = $card.find("em").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const paragraphs = $card
      .find(".content p")
      .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
      .get();
    // [0] duplicates the title, [1] is the artist name, [2] is the
    // location/tag ("Gallery" for on-site, "Institutional" for off-site).
    const artist = paragraphs[1] || null;
    const tag = paragraphs[2] || "";
    if (/institutional/i.test(tag)) return;

    const dateText = $card.find("b").first().text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;

    const imageUrl = $(`.exhibition-thumbnail.${id} img`).first().attr("src") ?? null;

    events.push({
      id,
      title,
      artist,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchNicolettiContemporaryEvents(): Promise<NicolettiContemporaryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Nicoletti Contemporary listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseNicolettiContemporaryEvent(
  raw: NicolettiContemporaryRawEvent
): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Nicoletti Contemporary event ${raw.id} has no start date`);

  return {
    title: raw.artist ? `${raw.title} — ${raw.artist}` : raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Nicoletti Contemporary",
      sourceType: "nicoletti-contemporary",
      profileUrl: LISTING_URL,
    },
    category: "gallery-exhibition",
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "nicoletti-contemporary", id: raw.id, url: raw.url },
  };
}
