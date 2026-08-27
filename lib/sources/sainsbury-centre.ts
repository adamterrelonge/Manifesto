import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Sainsbury Centre (University of East Anglia), Norwich. robots.txt
// permissive, /whats-on/ returns a clean 200, server-rendered (not an
// SPA), unpaginated (11 cards). Card shape:
//   <div class="event_tile">
//     <div class="event_tile__img">
//       <img src="...">
//       <div class="event_tile__cats"><span>Category</span></div>
//     </div>
//     <div class="event_tile__copy">
//       <div>
//         <h3>Title</h3>
//         <p>Description...</p>
//         <p>16 May - 15 November 2026</p>
//       </div>
//       ...
//     </div>
//     <a href="..." aria-label="See more"></a>   (sibling of .event_tile__copy, not a wrapper)
//   </div>
// Free-text date is always the second <p> under .event_tile__copy > div —
// the first is the description.

const BASE_URL = "https://sainsburycentre.ac.uk";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "Sainsbury Centre",
  address: "University of East Anglia, Norfolk Road",
  city: "Norwich",
  region: "Norfolk",
  postcode: "NR4 7TJ",
  lat: 52.622394,
  lng: 1.241412,
};

export interface SainsburyCentreRawEvent {
  slug: string;
  title: string;
  description: string | null;
  tag: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
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

// "16 May - 15 November 2026"
function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

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

function parseListingPage(html: string): SainsburyCentreRawEvent[] {
  const $ = cheerio.load(html);
  const events: SainsburyCentreRawEvent[] = [];
  const seen = new Set<string>();

  $(".event_tile").each((_, el) => {
    const $card = $(el);

    const href = $card.find('a[aria-label="See more"]').first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".event_tile__copy h3").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const paragraphs = $card.find(".event_tile__copy > div > p");
    const description = paragraphs.eq(0).text().replace(/\s+/g, " ").trim() || null;
    const dateText = paragraphs.eq(1).text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;

    const tag = $card.find(".event_tile__cats span").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find(".event_tile__img img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({
      slug,
      title,
      description,
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

export async function fetchSainsburyCentreEvents(): Promise<SainsburyCentreRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Sainsbury Centre listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseSainsburyCentreEvent(raw: SainsburyCentreRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Sainsbury Centre event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Sainsbury Centre",
      sourceType: "sainsbury-centre",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "sainsbury-centre", id: raw.slug, url: raw.url },
  };
}
