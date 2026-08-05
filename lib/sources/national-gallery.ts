import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// /whats-on lists two card shapes on one unpaginated page — no detail-page
// fetch needed, unlike design-museum.ts:
//   - exhibitions (article.ng-card, no ng-event-card class): a
//     `.exhibition-date` div, "Until 23 August 2026".
//   - events/talks/tours (article.ng-card.ng-event-card): a plain `.date`
//     div, either a real date ("Friday, 14 August 2026") or unparseable
//     recurring text ("Saturdays (excluding public holidays)") — the latter
//     are skipped, there's no single startAt to report.
// Verified against live markup; neither card type carries a description.

const BASE_URL = "https://www.nationalgallery.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUE = {
  name: "The National Gallery",
  address: "Trafalgar Square",
  city: "London",
  region: "Greater London",
  postcode: "WC2N 5DN",
  lat: 51.5089,
  lng: -0.1283,
};

export interface NationalGalleryRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  isExhibition: boolean;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

function parseListingPage(html: string): NationalGalleryRawEvent[] {
  const $ = cheerio.load(html);
  const events: NationalGalleryRawEvent[] = [];
  const seen = new Set<string>();
  const now = new Date();

  $("article.ng-card").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a[href]").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const isExhibition = !$card.hasClass("ng-event-card");
    const costText = $card.find(isExhibition ? ".exhibition-cost" : ".cost").first().text();
    const isFree = /free/i.test(costText);

    const bgStyle =
      $card.find(".thumbnail-inner div[style*='background-image']").first().attr("style") ?? "";
    const bgMatch = bgStyle.match(/background-image:url\(['"]?([^'")]+)['"]?\)/);
    const imageUrl = bgMatch ? (bgMatch[1].startsWith("http") ? bgMatch[1] : `${BASE_URL}${bgMatch[1]}`) : null;

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    let startAt: string | null = null;
    let endAt: string | null = null;

    if (isExhibition) {
      const title = $card.find(".title").first().text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const dateText = $card.find(".exhibition-date").first().text().replace(/\s+/g, " ").trim();
      const untilMatch = dateText.match(/Until\s+(.+)/i);
      if (untilMatch) {
        const end = parseDMY(untilMatch[1]);
        if (end) {
          startAt = now.toISOString();
          endAt = end.toISOString();
        }
      } else {
        const single = parseDMY(dateText);
        if (single) startAt = single.toISOString();
      }
      if (!startAt) return;

      events.push({ slug, title, imageUrl, startAt, endAt, isFree, isExhibition, url });
    } else {
      const title = $card.find("h3").first().text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const dateText = $card.find(".date").first().text().replace(/\s+/g, " ").trim();
      const rangeParts = dateText.split(/\s*[–—-]\s*/);

      if (rangeParts.length >= 2 && /\d{4}/.test(dateText)) {
        // "22 July - 26 August 2026" — a run, not a single-day event.
        const yearMatch = dateText.match(/(\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
        const start = parseDMY(rangeParts[0], year);
        if (!start) return;
        startAt = start.toISOString();
        const end = parseDMY(rangeParts[1], year);
        endAt = end ? end.toISOString() : null;
      } else {
        // Either a single date ("Friday, 14 August 2026"), a "Various dates
        // from X" recurring series (parseDMY picks up the trailing date as
        // a reasonable first-occurrence approximation), or genuinely
        // unparseable recurring text ("Saturdays (excluding public
        // holidays)") — parseDMY returns null for the latter and the card
        // is correctly skipped.
        const single = parseDMY(dateText);
        if (!single) return;
        startAt = single.toISOString();
      }

      events.push({ slug, title, imageUrl, startAt, endAt, isFree, isExhibition, url });
    }
  });

  return events;
}

export async function fetchNationalGalleryEvents(): Promise<NationalGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`National Gallery listing error: ${res.status} ${res.statusText}`);

  return parseListingPage(await res.text());
}

export function normaliseNationalGalleryEvent(raw: NationalGalleryRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`National Gallery event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "The National Gallery",
      sourceType: "national-gallery",
      profileUrl: LISTING_URL,
    },
    category: raw.isExhibition ? "gallery-exhibition" : null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "national-gallery", id: raw.slug, url: raw.url },
  };
}
