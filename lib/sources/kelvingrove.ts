import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://www.glasgowlife.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on?venue=Kelvingrove+Art+Gallery+and+Museum&channel=All`;

const VENUE = {
  name: "Kelvingrove Art Gallery and Museum",
  address: "Argyle Street",
  city: "Glasgow",
  region: "Glasgow City",
  postcode: "G3 8AG",
  lat: 55.8686,
  lng: -4.2906,
};

export interface KelvingroveRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  isFree: boolean;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// Two date-text shapes seen live:
//   "Sat 13 Jun–Sun 18 Oct 2026"                         (one-off run)
//   "Every week on Saturday from 29th Nov 2025 until 19th Dec 2026" (recurring
//      series — parsed as its overall start/end window, same simplification
//      this codebase already makes for long-running programmes elsewhere,
//      e.g. Ibraaz's Library-in-Residence)
function parseKelvingroveDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/(\d+)(st|nd|rd|th)\b/gi, "$1").replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const fromUntil = clean.match(/from\s+(.+?)\s+until\s+(.+)$/i);
  if (fromUntil) {
    const start = parseDMY(fromUntil[1]);
    const end = parseDMY(fromUntil[2]);
    return {
      startAt: start ? start.toISOString() : null,
      endAt: end ? end.toISOString() : null,
    };
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

// Cards render as:
//   <article class="card">
//     <div class="card__bd">
//       <h2 class="card__title"><a href="/event/ID/SLUG" class="card__link">Title</a></h2>
//       <div class="card__footer">
//         <div class="card__meta">DATE TEXT</div>
//         <div class="card__meta">Venue name</div>
//       </div>
//     </div>
//     <img class="card__img" src="...">
//   </article>
function parseListingPage(html: string): KelvingroveRawEvent[] {
  const $ = cheerio.load(html);
  const events: KelvingroveRawEvent[] = [];
  const seen = new Set<string>();

  $("article.card").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find("h2.card__title a.card__link").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".card__meta").first().text();
    const { startAt, endAt } = parseKelvingroveDateRange(dateText);
    if (!startAt) return;

    const imageUrl = $card.find("img.card__img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({
      slug,
      title,
      description: null,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchKelvingroveEvents(): Promise<KelvingroveRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Kelvingrove listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseKelvingroveEvent(raw: KelvingroveRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Kelvingrove event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Kelvingrove Art Gallery and Museum", sourceType: "kelvingrove", profileUrl: LISTING_URL },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "kelvingrove", id: raw.slug, url: raw.url },
  };
}
