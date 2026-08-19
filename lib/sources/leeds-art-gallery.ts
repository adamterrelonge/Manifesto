import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://museumsandgalleries.leeds.gov.uk";
const LISTING_URL = `${BASE_URL}/exhibitions-at-leeds-art-gallery-4663`;

const VENUE = {
  name: "Leeds Art Gallery",
  address: "The Headrow",
  city: "Leeds",
  region: "West Yorkshire",
  postcode: "LS1 3AA",
  lat: 53.7995,
  lng: -1.545,
};

export interface LeedsArtGalleryRawEvent {
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

// "26 June 2026 – 29 August 2027" / "22 May - 30 August 2026" (no year on
// the left part borrows the right part's year, same convention as every
// other date-range parser in this codebase).
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

// Cards render (duplicated verbatim in the raw HTML — a carousel copy and
// a full-grid copy of the same content — so results are deduped by slug):
//   <div class="desc">
//     <a class="desc-link" href="/SLUG">
//       <h3>Title</h3>
//       <div class="richtext">DATE RANGE | Leeds Art Gallery | description</div>
//     </a>
//   </div>
function parseListingPage(html: string): LeedsArtGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: LeedsArtGalleryRawEvent[] = [];
  const seen = new Set<string>();

  $("a.desc-link[href]").each((_, el) => {
    const $link = $(el);
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $link.find("h3").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const richtext = $link.find(".richtext").first().text().replace(/\s+/g, " ").trim();
    const [dateText, , ...descParts] = richtext.split("|").map((p) => p.trim());
    if (!dateText) return;

    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;

    const description = descParts.join(" | ").trim() || null;

    const $card = $link.closest("section, article, div.desc").length
      ? $link.closest("section, article, div.desc")
      : $link.parent();
    const imageUrl = $card.find("img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({
      slug,
      title,
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

export async function fetchLeedsArtGalleryEvents(): Promise<LeedsArtGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Leeds Art Gallery listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseLeedsArtGalleryEvent(raw: LeedsArtGalleryRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Leeds Art Gallery event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Leeds Art Gallery", sourceType: "leeds-art-gallery", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "leeds-art-gallery", id: raw.slug, url: raw.url },
  };
}
