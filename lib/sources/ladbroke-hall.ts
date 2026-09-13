import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDayRange } from "./scrape-utils";

// Ladbroke Hall — Notting Hill (79 Barlby Road, W10 6AZ), a mixed-use arts
// venue (exhibitions, live music, screenings, talks, cabaret). Its site
// splits programming across per-category pages (/live-programme/exhibition/,
// /live-programme/live-music/, etc.), but the base /live-programme/ page
// itself already renders every upcoming event across all categories in one
// unpaginated grid — confirmed live it includes "Charlotte Mensah:
// Community Matters" (an Exhibition-category card) alongside Live Music
// cards, so only that one URL is scraped rather than each category page
// separately. Card dates never carry a year (e.g. "8 – 13 September").

const BASE_URL = "https://ladbrokehall.com";
const LISTING_URL = `${BASE_URL}/live-programme/`;

const VENUE = {
  name: "Ladbroke Hall",
  address: "79 Barlby Road",
  city: "London",
  region: "Greater London",
  postcode: "W10 6AZ",
  lat: null as number | null,
  lng: null as number | null,
};

// The site's own free-text category label (after stripping the "featured
// event | " prefix some cards carry) — mapped where unambiguous, left
// unmapped otherwise so lib/categories.ts's title/description inference
// gets a chance instead of a wrong guess.
const CATEGORY_MAP: Record<string, Category> = {
  exhibition: "gallery-exhibition",
  "live music": "music",
  jazz: "music",
  "classical music": "music",
  screening: "film",
  talks: "workshop-talk",
  "talks & workshops": "workshop-talk",
  workshops: "workshop-talk",
  "workshops & masterclasses": "workshop-talk",
  cabaret: "theatre-performance",
  "theatre & dance": "theatre-performance",
  community: "community-social",
};

function mapCategory(raw: string | null): Category | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^featured event\s*\|\s*/i, "").trim().toLowerCase();
  return CATEGORY_MAP[cleaned] ?? null;
}

export interface LadbrokeHallRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  category: Category | null;
  url: string;
}

export async function fetchLadbrokeHallEvents(): Promise<LadbrokeHallRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Ladbroke Hall listing error: ${res.status} ${res.statusText}`);

  const $ = cheerio.load(await res.text());
  const events: LadbrokeHallRawEvent[] = [];
  const seen = new Set<string>();

  $(".event--block").each((_, el) => {
    const $card = $(el);

    const linkEl = $card.find("a.title").first();
    const href = linkEl.attr("href") ?? "";
    if (!href) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const slugMatch = url.match(/\/([^/]+)\/?$/);
    const slug = slugMatch ? slugMatch[1] : url;
    if (seen.has(slug)) return;
    seen.add(slug);

    const title =
      $card.attr("aria-label")?.trim() ||
      linkEl.attr("aria-label")?.trim() ||
      $card.find(".screen-reader-text").first().text().trim();
    if (!title) return;

    const dateText = $card.find(".date").first().text().replace(/\s+/g, " ").trim();
    const { startAt, endAt } = parseDayRange(dateText);
    if (!startAt) return;

    const description =
      $card.find(".subtitle").first().text().replace(/\s+/g, " ").trim() || null;

    const categoryText = $card.find(".category").first().text().trim() || null;

    const imageUrl = $card.find(".event--block__image img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt: startAt.toISOString(),
      endAt: endAt ? endAt.toISOString() : null,
      category: mapCategory(categoryText),
      url,
    });
  });

  return events;
}

export function normaliseLadbrokeHallEvent(raw: LadbrokeHallRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Ladbroke Hall event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Ladbroke Hall", sourceType: "ladbroke-hall", profileUrl: BASE_URL },
    category: raw.category,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "ladbroke-hall", id: raw.slug, url: raw.url },
  };
}
