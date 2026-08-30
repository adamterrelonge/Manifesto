import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Aberdeen Art Gallery & Museums (Aberdeen City Council's AAGM site,
// Drupal Views). `/AAGM/whats` is server-rendered — no robots.txt AI-bot
// block, no client-side hydration needed. Each card is
// `div.views-field-nothing > div.field-content`: a link+image+title, then
// 1-2 `div.p` text blocks where the LAST one is always the date text (an
// optional description sits before it). Three date shapes: a full range
// ("4 February 2026-3 March 2027"), a range with the year only on the end
// ("28 February-6 September 2026"), a range with a bare start day
// ("1-29 August 2026", month/year borrowed from the end), and a single
// timed date before a comma ("Wednesday 2 September 2026, 12.30pm-1.15pm" —
// parseDMY's leading-weekday tolerance handles the day name, the time
// range after the comma is dropped).

const BASE_URL = "https://sites.aberdeencity.gov.uk";
const LISTING_URL = `${BASE_URL}/AAGM/whats`;

const VENUE = {
  name: "Aberdeen Art Gallery",
  address: "Schoolhill",
  city: "Aberdeen",
  region: "Aberdeenshire",
  postcode: "AB10 1FQ",
  lat: 57.1477,
  lng: -2.103,
};

export interface AberdeenArtGalleryRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string;
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

function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const commaIdx = clean.indexOf(",");
  if (commaIdx !== -1) {
    const single = parseDMY(clean.slice(0, commaIdx));
    return single ? { startAt: single.toISOString(), endAt: null } : { startAt: null, endAt: null };
  }

  if (!/-/.test(clean)) {
    const single = parseDMY(clean);
    return single ? { startAt: single.toISOString(), endAt: null } : { startAt: null, endAt: null };
  }

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*-\s*/);
  const end = parseDMY(parts[parts.length - 1], year);
  let start = parseDMY(parts[0], year);
  if (!start && end) {
    const dayOnly = parts[0].trim().match(/^\d{1,2}$/);
    if (dayOnly) start = new Date(end.getFullYear(), end.getMonth(), parseInt(dayOnly[0], 10));
  }

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): AberdeenArtGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: AberdeenArtGalleryRawEvent[] = [];
  const seen = new Set<string>();

  $("div.views-field-nothing > div.field-content").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    if (!href || !href.includes("/whats-")) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".aagm-menu-text").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const textBlocks = $card
      .find("> div.p")
      .map((__, p) => $(p).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    if (textBlocks.length === 0) return;

    const dateText = textBlocks[textBlocks.length - 1];
    const description = textBlocks.length > 1 ? textBlocks[0] : null;
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchAberdeenArtGalleryEvents(): Promise<AberdeenArtGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Aberdeen Art Gallery listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseAberdeenArtGalleryEvent(raw: AberdeenArtGalleryRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Aberdeen Art Gallery", sourceType: "aberdeen-art-gallery", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "aberdeen-art-gallery", id: raw.slug, url: raw.url },
  };
}
