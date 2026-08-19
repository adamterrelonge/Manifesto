import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://www.theherbert.org";
const LISTING_URL = `${BASE_URL}/whats-on/`;

const VENUE = {
  name: "Herbert Art Gallery & Museum",
  address: "Jordan Well",
  city: "Coventry",
  region: "West Midlands",
  postcode: "CV1 5QP",
  lat: 52.4072,
  lng: -1.5061,
};

const TAG_CATEGORY: Record<string, Category> = {
  exhibition: "gallery-exhibition",
  family: "family-kids",
  talk: "workshop-talk",
  workshop: "workshop-talk",
  film: "film",
  music: "music",
};

export interface HerbertCoventryRawEvent {
  slug: string;
  title: string;
  tag: string | null;
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

// "20 February 2023 – 19 February 2027" (also a plain single date with no range).
function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*[–—-]\s*/);

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

// Cards render as:
//   <div class="module_listing_container">
//     <div class="module_listing_image">
//       <a href="/whats-on/ID/SLUG"><img src="..." alt="Title"></a>
//       <ul class="module_listing_categories"><li>Exhibition</li><li>Family</li></ul>
//     </div>
//     <h2 class="module_listing_title"><a href="/whats-on/ID/SLUG">Title</a></h2>
//     <div class="module_listing_content">
//       <p class="module_listing_metadata">DATE RANGE</p>
//       <p>description... <a>Read more</a></p>
//     </div>
//   </div>
function parseListingPage(html: string): HerbertCoventryRawEvent[] {
  const $ = cheerio.load(html);
  const events: HerbertCoventryRawEvent[] = [];
  const seen = new Set<string>();

  $(".module_listing_container").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find(".module_listing_title a[href]").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".module_listing_metadata").first().text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;

    const tag = $card.find(".module_listing_categories li").first().text().trim().toLowerCase() || null;

    const description =
      $card
        .find(".module_listing_content > p")
        .not(".module_listing_metadata")
        .first()
        .clone()
        .find("a")
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim() || null;

    let imageUrl = $card.find(".module_listing_image img").first().attr("src") ?? null;
    if (imageUrl && imageUrl.startsWith("../")) imageUrl = `${BASE_URL}/${imageUrl.replace(/^(\.\.\/)+/, "")}`;

    const isFree = /\bfree\b/i.test($card.text());

    events.push({
      slug,
      title,
      tag,
      description,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHerbertCoventryEvents(): Promise<HerbertCoventryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Herbert Coventry listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseHerbertCoventryEvent(raw: HerbertCoventryRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Herbert Coventry event ${raw.slug} has no start date`);

  const category: Category | null = raw.tag ? TAG_CATEGORY[raw.tag] ?? null : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Herbert Art Gallery & Museum",
      sourceType: "herbert-coventry",
      profileUrl: LISTING_URL,
    },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "herbert-coventry", id: raw.slug, url: raw.url },
  };
}
