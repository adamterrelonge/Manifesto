import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Leeds. This is the Henry Moore Foundation's own site (henry-moore.org) —
// NOT the Leeds Museums & Galleries platform lib/sources/leeds-art-gallery.ts
// scrapes, despite living a few doors down; an earlier note in this repo's
// docs guessing they shared a platform was wrong. robots.txt is permissive
// (`Disallow: /admin/*` only).
//
// Card shape:
//   <div class="c-col c-event-card c-event-card--CATEGORY u-*-theme">
//     <a class="c-col-card__link" href="https://henry-moore.org/whats-on/SLUG/">...</a>
//     <figure><img src="..."></figure>
//     <div class="c-event-card__content">
//       <p class="c-event-card__type">Exhibition</p>
//       <h3 class="c-event-card__title">Title</h3>
//       <time class="c-event-card__date">15 May – 30 August 2026</time>
//       <div class="c-event-card__venues">
//         <div class="c-event-card__venue">Sculpture Galleries</div>
//         <span class="c-event-card__location">Henry Moore Institute, Leeds</span>
//       </div>
//     </div>
//   </div>
// The category is baked into the card's own class list
// (c-event-card--exhibition / --guided-tour / --library-display /
// --sculpture-demonstration-and-hands-on-lecture /
// --early-career-research-symposium). One card seen live had
// `.c-event-card__location` = "Leeds Art Gallery, UK" (a co-programmed
// event physically at the neighbouring venue) — skipped rather than
// mis-tagged with this venue's own coordinates, same as
// lib/sources/street-level-photoworks.ts's off-site-exhibition handling.

const BASE_URL = "https://henry-moore.org";
const LISTING_URL = `${BASE_URL}/henry-moore-institute/whats-on-henry-moore-institute/`;

const VENUE = {
  name: "Henry Moore Institute",
  address: "74 The Headrow",
  city: "Leeds",
  region: "West Yorkshire",
  postcode: "LS1 3AH",
  lat: 53.800043,
  lng: -1.547451,
};

const TYPE_CATEGORY: Record<string, Category> = {
  "c-event-card--exhibition": "gallery-exhibition",
  "c-event-card--library-display": "gallery-exhibition",
  "c-event-card--guided-tour": "workshop-talk",
  "c-event-card--sculpture-demonstration-and-hands-on-lecture": "workshop-talk",
  "c-event-card--early-career-research-symposium": "workshop-talk",
};

export interface HenryMooreInstituteRawEvent {
  slug: string;
  title: string;
  category: Category | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/whats-on\/|\/+$/g, "");
  } catch {
    return url.replace(/^\/+|\/+$/g, "");
  }
}

// "15 May – 30 August 2026"
function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): HenryMooreInstituteRawEvent[] {
  const $ = cheerio.load(html);
  const events: HenryMooreInstituteRawEvent[] = [];
  const seen = new Set<string>();

  $(".c-event-card").each((_, el) => {
    const $card = $(el);

    const location = $card.find(".c-event-card__location").first().text().trim();
    if (location && !location.startsWith("Henry Moore Institute")) return;

    const href = $card.find("a.c-col-card__link").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".c-event-card__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".c-event-card__date").first().text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;

    const typeClass = ($card.attr("class") ?? "")
      .split(/\s+/)
      .find((c) => c.startsWith("c-event-card--"));
    const category = typeClass ? TYPE_CATEGORY[typeClass] ?? null : null;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      category,
      imageUrl,
      startAt,
      endAt,
      url: href,
    });
  });

  return events;
}

export async function fetchHenryMooreInstituteEvents(): Promise<HenryMooreInstituteRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Henry Moore Institute listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseHenryMooreInstituteEvent(
  raw: HenryMooreInstituteRawEvent
): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Henry Moore Institute event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Henry Moore Institute",
      sourceType: "henry-moore-institute",
      profileUrl: LISTING_URL,
    },
    category: raw.category,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "henry-moore-institute", id: raw.slug, url: raw.url },
  };
}
