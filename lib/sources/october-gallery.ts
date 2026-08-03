import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://www.octobergallery.co.uk";
const LISTING_URL = `${BASE_URL}/exhibitions/`;

const VENUE = {
  name: "October Gallery",
  address: "24 Old Gloucester Street",
  city: "London",
  region: "Greater London",
  postcode: "WC1N 3AL",
  lat: 51.5214,
  lng: -0.121,
};

export interface OctoberGalleryRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

// "2nd July - 15th August 2026" or "16 Apr 2026 – 16 May 2026"
function parseOGDates(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/(\d+)(?:st|nd|rd|th)\b/gi, "$1").trim();
  const parts = clean.split(/\s*[-–]\s*/);

  if (parts.length < 2) {
    const d = parseDMY(clean);
    return { startAt: d ? d.toISOString() : null, endAt: null };
  }

  const endDate = parseDMY(parts[parts.length - 1]);
  if (!endDate) return { startAt: null, endAt: null };

  const startDate = parseDMY(parts[0], endDate.getFullYear());
  return {
    startAt: startDate ? startDate.toISOString() : null,
    endAt: endDate.toISOString(),
  };
}

export async function fetchOctoberGalleryEvents(): Promise<OctoberGalleryRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`October Gallery listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const now = new Date();
  const events: OctoberGalleryRawEvent[] = [];

  $("article").each((_, el) => {
    (function (node: typeof el) {
      const $card = $(node);

      const titleEl = $card.find("div.exhib-title h2 a").first();
      const title = titleEl.text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const href = titleEl.attr("href") ?? "";
      const slug = href.replace(/^\/exhibitions\//, "").replace(/\/$/, "");
      if (!slug) return;
      const url = `${BASE_URL}/exhibitions/${slug}`;

      const datesText = $card.find("div.dates").first().text().trim();
      const { startAt, endAt } = parseOGDates(datesText);

      const endDate = endAt ? new Date(endAt) : null;
      const startDate = startAt ? new Date(startAt) : null;
      const isVisible = endDate ? endDate >= now : startDate ? startDate >= now : false;
      if (!isVisible) return;

      const imgSrc = $card.find("img").first().attr("src") ?? null;
      const imageUrl = imgSrc
        ? imgSrc.startsWith("http")
          ? imgSrc
          : `${BASE_URL}${imgSrc}`
        : null;

      const $clone = $card.clone();
      $clone.find("div.exhib-title, div.dates, div.figure-right").remove();
      const description = $clone.text().replace(/\s+/g, " ").trim() || null;

      events.push({ slug, title, description, imageUrl, startAt, endAt, isFree: true, url });
    })(el);
  });

  return events;
}

export function normaliseOctoberGalleryEvent(raw: OctoberGalleryRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`October Gallery event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "October Gallery",
      sourceType: "october-gallery",
      profileUrl: BASE_URL,
    },
    category: "gallery-exhibition",
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "october-gallery", id: raw.slug, url: raw.url },
  };
}
