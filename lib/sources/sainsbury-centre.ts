import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Sainsbury Centre (University of East Anglia), Norwich — rebranded online
// as Sainsbury Museum; sainsburycentre.ac.uk now 301s to
// sainsburymuseum.com (moved 2026; the old event_tile markup is gone).
// robots.txt permissive, /whats-on/ server-rendered (WordPress), unpaginated
// (~50 cards incl. permanent displays and past exhibitions). Card shape:
//   <li class="sm-card" data-categories="exhibitions">
//     <div class="sm-card__image"><img src="..."></div>
//     <div class="sm-card__body">
//       <p class="sm-card__labels"><span class="sm-label">Events</span>...</p>
//       <p class="sm-card__date">13 Nov 2026 - 11 Apr 2027</p>   (absent on undated cards)
//       <h3 class="sm-card__title"><a class="sm-card__link" href="...">Title</a></h3>
//       <div class="sm-card__text">Description</div>
//     </div>
//   </li>
// Undated cards (permanent displays, free daily tours, past exhibitions)
// are skipped — they have no date to place on a calendar.

const BASE_URL = "https://sainsburymuseum.com";
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

// "13 Nov 2026 - 11 Apr 2027" / "16 May - 15 November 2026" / "22 Dec 2026"
export function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const years = clean.match(/\d{4}/g);
  const lastYear = years ? parseInt(years[years.length - 1], 10) : undefined;

  const end = parts.length >= 2 ? parseDMY(parts[parts.length - 1], lastYear) : null;
  let start = parseDMY(parts[0], lastYear);
  // "18 Dec - 5 Jan 2027": the start has no year of its own and the shared
  // one belongs to the end, so the start is in the year before.
  if (start && end && start > end && !/\d{4}/.test(parts[0])) {
    start = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
  }

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

export function parseListingPage(html: string): SainsburyCentreRawEvent[] {
  const $ = cheerio.load(html);
  const events: SainsburyCentreRawEvent[] = [];
  const seen = new Set<string>();
  const text = (t: string) => t.replace(/\s+/g, " ").trim();

  $(".sm-card").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a.sm-card__link").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;

    const labels = $card
      .find(".sm-card__labels span")
      .map((_, l) => text($(l).text()))
      .get()
      .filter(Boolean);
    if (labels.some((l) => /^past exhibitions$/i.test(l))) return;

    const title = text($card.find(".sm-card__title").first().text());
    if (!title) return;

    const { startAt, endAt } = parseDateRange($card.find(".sm-card__date").first().text());
    if (!startAt) return;
    seen.add(slug);

    const description = text($card.find(".sm-card__text").first().text()) || null;
    const imageUrl = $card.find(".sm-card__image img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      tag: labels[0] ?? null,
      imageUrl,
      isFree: /\bfree\b/i.test($card.text()),
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
