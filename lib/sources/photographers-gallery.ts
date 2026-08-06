import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// /whats-on is a paginated Drupal Views listing (?page=N, 0-indexed, 2 pages
// confirmed live). Same "o-teaser" component family as soane.ts, but dates
// here are inconsistent: most cards carry only a free-text `.o-teaser__date`
// paragraph ("04 Aug 2026 - 01 Nov 2026" or "1:00pm, Sat 08 Aug 2026"), only
// occasionally with a machine-readable `<time datetime>` inside it — so this
// always parses the paragraph's own text rather than preferring the
// sometimes-present datetime attribute, for one consistent code path.
// Card markup: article.o-teaser
//   .o-teaser__post-type    — badge text, e.g. "Exhibition"/"Talks & Events"
//   .o-teaser__title a      — title + href
//   .o-teaser__date         — free-text date/range paragraph
//   .o-teaser__content > p  — description (a sibling paragraph after
//                             .o-teaser__body-text, which is itself always
//                             empty due to a nested-<p> markup quirk)

const BASE_URL = "https://thephotographersgallery.org.uk";
const LISTING_PATH = "/whats-on";
const MAX_PAGES = 10;

const VENUE = {
  name: "The Photographers' Gallery",
  address: "16-18 Ramillies Street",
  city: "London",
  region: "Greater London",
  postcode: "W1F 7LW",
  lat: 51.5142,
  lng: -0.1401,
};

const POST_TYPE_CATEGORY: Record<string, Category> = {
  Exhibition: "gallery-exhibition",
  "Talks & Events": "workshop-talk",
  "Workshops & Courses": "workshop-talk",
  "Bookshop Event": "community-social",
};

export interface PhotographersGalleryRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  isFree: boolean;
  postType: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// "04 Aug 2026 - 01 Nov 2026" / "10:00am, Mon 20 Jul 2026 - 11:59pm, Sun 06
// Sep 2026" / a single date or timed date with no range.
function parseDateRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const start = parseDMY(parts[0]);
  const end = parts.length >= 2 ? parseDMY(parts[1]) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): PhotographersGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: PhotographersGalleryRawEvent[] = [];

  $("article.o-teaser").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find(".o-teaser__title a").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug) return;

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".o-teaser__date").first().text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return; // unparseable date — skip

    const postType = $card.find(".o-teaser__post-type").first().text().trim() || null;

    const description =
      $card
        .find(".o-teaser__content > p")
        .filter((_, p) => !($(p).attr("class") ?? "").includes("o-teaser__date"))
        .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
        .get()
        .find((t) => t) || null;

    const isFree = /\bfree\b/i.test(`${title} ${description ?? ""}`);

    const $img = $card.find("picture img").first();
    const img = $img.attr("data-srcset") ?? $img.attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      isFree,
      postType,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchPhotographersGalleryEvents(): Promise<PhotographersGalleryRawEvent[]> {
  const seen = new Map<string, PhotographersGalleryRawEvent>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${BASE_URL}${LISTING_PATH}?page=${page}`, {
      headers: REQUEST_HEADERS,
    });
    if (!res.ok) {
      throw new Error(`Photographers' Gallery listing page ${page} error: ${res.status} ${res.statusText}`);
    }

    const pageEvents = parseListingPage(await res.text());
    if (pageEvents.length === 0) break;

    const sizeBefore = seen.size;
    for (const event of pageEvents) seen.set(event.slug, event);
    if (seen.size === sizeBefore) break;
  }

  return [...seen.values()];
}

export function normalisePhotographersGalleryEvent(
  raw: PhotographersGalleryRawEvent
): NormalisedEvent {
  const category: Category | null = raw.postType ? POST_TYPE_CATEGORY[raw.postType] ?? null : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "The Photographers' Gallery",
      sourceType: "photographers-gallery",
      profileUrl: `${BASE_URL}${LISTING_PATH}`,
    },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "photographers-gallery", id: raw.slug, url: raw.url },
  };
}
