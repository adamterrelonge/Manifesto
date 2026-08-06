import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS } from "./scrape-utils";

// /whats-on is a paginated Drupal Views listing (?page=N, 0-indexed, 3 pages
// confirmed live). Each card carries two `<time datetime="...">` ISO
// timestamps directly (start/end) — no free-text date parsing or detail-page
// fetch needed, unlike national-gallery.ts/design-museum.ts. Card markup:
//   article > .o-teaser
//     .o-teaser__event-type   — badge text, e.g. "Exhibitions"/"Tours"/"Families"
//     .o-teaser__title a      — title + href
//     .o-teaser__date time[datetime] x2 — start, end (both required)
//     .o-teaser__price p      — free text, e.g. "Free (booking not required)"
//     .o-teaser__content > p  — description (direct child, sibling of
//                               .o-teaser__info, so doesn't match the date/
//                               price paragraphs nested inside .o-teaser__info)
// The page also renders a "featured" card a second time as the first
// article in the DOM — the slug-keyed dedup below handles that for free.

const BASE_URL = "https://www.soane.org";
const LISTING_PATH = "/whats-on";
const MAX_PAGES = 10;

const VENUE = {
  name: "Sir John Soane's Museum",
  address: "13 Lincoln's Inn Fields",
  city: "London",
  region: "Greater London",
  postcode: "WC2A 3BP",
  lat: 51.517,
  lng: -0.1166,
};

const EVENT_TYPE_CATEGORY: Record<string, Category> = {
  Exhibitions: "gallery-exhibition",
  Tours: "workshop-talk",
  Families: "family-kids",
  Talks: "workshop-talk",
};

export interface SoaneRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean;
  eventType: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

function parseListingPage(html: string): SoaneRawEvent[] {
  const $ = cheerio.load(html);
  const events: SoaneRawEvent[] = [];

  $("article").each((_, el) => {
    const $card = $(el).find(".o-teaser").first();
    if ($card.length === 0) return;

    const $titleLink = $card.find(".o-teaser__title a").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const times = $card
      .find(".o-teaser__date time[datetime]")
      .map((_, t) => $(t).attr("datetime"))
      .get()
      .filter((d): d is string => !!d);
    if (times.length === 0) return; // no machine-readable date — skip

    const startAt = new Date(times[0]).toISOString();
    const endAt = times[1] ? new Date(times[1]).toISOString() : null;

    const priceText = $card.find(".o-teaser__price p").first().text().trim();
    const isFree = /free/i.test(priceText);

    const description =
      $card
        .find(".o-teaser__content > p")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim() || null;

    const eventType = $card.find(".o-teaser__event-type").first().text().trim() || null;

    const img = $card.find("picture img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      isFree,
      eventType,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchSoaneEvents(): Promise<SoaneRawEvent[]> {
  const seen = new Map<string, SoaneRawEvent>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${BASE_URL}${LISTING_PATH}?page=${page}`, {
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) throw new Error(`Soane listing page ${page} error: ${res.status} ${res.statusText}`);

    const pageEvents = parseListingPage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const event of pageEvents) seen.set(event.slug, event);
    // Views' pager repeats the last page once N exceeds the real page
    // count — stop once a page adds nothing new, same as barbican.ts.
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

export function normaliseSoaneEvent(raw: SoaneRawEvent): NormalisedEvent {
  const category: Category | null = raw.eventType ? EVENT_TYPE_CATEGORY[raw.eventType] ?? null : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Sir John Soane's Museum",
      sourceType: "soane",
      profileUrl: `${BASE_URL}${LISTING_PATH}`,
    },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "soane", id: raw.slug, url: raw.url },
  };
}
