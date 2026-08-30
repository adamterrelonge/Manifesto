import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Bath & North East Somerset Council's Victoria Art Gallery (Drupal Views).
// `/events` is a server-rendered 3-column grid — each `.views-row` is one
// row of 3 cards, so the individual event is the inner `.views-col`, not
// the row itself. Dedicated date field
// (`.views-field-field-from-to .field-content`) is always the clean
// "X to Y" shape with a full year on both sides — no free-text ambiguity
// to resolve, unlike most other date-text adapters in this codebase.

const BASE_URL = "https://www.victoriagal.org.uk";
const LISTING_URL = `${BASE_URL}/events`;

const VENUE = {
  name: "Victoria Art Gallery",
  address: "Bridge Street",
  city: "Bath",
  region: "Somerset",
  postcode: "BA2 4AT",
  lat: 51.3818,
  lng: -2.3592,
};

export interface VictoriaArtGalleryRawEvent {
  slug: string;
  title: string;
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

function parseListingPage(html: string): VictoriaArtGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: VictoriaArtGalleryRawEvent[] = [];
  const seen = new Set<string>();

  $("div.views-col").each((_, el) => {
    const $card = $(el);

    const href = $card.find(".views-field-title a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".views-field-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card
      .find(".views-field-field-from-to .field-content")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const [startText, endText] = dateText.split(/\s+to\s+/i);
    const start = startText ? parseDMY(startText) : null;
    if (!start) return;
    const end = endText ? parseDMY(endText) : null;

    const imageUrl = $card.find(".views-field-field-na-image img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      startAt: start.toISOString(),
      endAt: end ? end.toISOString() : null,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchVictoriaArtGalleryEvents(): Promise<VictoriaArtGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Victoria Art Gallery listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseVictoriaArtGalleryEvent(raw: VictoriaArtGalleryRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Victoria Art Gallery", sourceType: "victoria-art-gallery", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "victoria-art-gallery", id: raw.slug, url: raw.url },
  };
}
