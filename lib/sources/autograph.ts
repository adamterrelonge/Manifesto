import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, parseTime, applyTime, mapWithConcurrency } from "./scrape-utils";

const BASE_URL = "https://autograph.org.uk";

const VENUE = {
  name: "Autograph ABP",
  address: "Rivington Place",
  city: "London",
  region: "Greater London",
  postcode: "EC2A 3BA",
  lat: 51.5244,
  lng: -0.0793,
};

export interface AutographRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  priceMin: number | null;
  url: string;
}

async function fetchEventSlugs(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/events`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Autograph listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const slugs = new Set<string>();

  $("a[href^='/events/']").each((_, el) => {
    const href = $(el).attr("href")!;
    // Skip the bare /events listing and any archive/category pages
    const slug = href.replace(/^\/events\//, "").replace(/\/$/, "");
    if (slug && !slug.includes("/")) slugs.add(slug);
  });

  return [...slugs];
}

async function fetchEventDetail(slug: string): Promise<AutographRawEvent> {
  const url = `${BASE_URL}/events/${slug}`;
  const empty: AutographRawEvent = {
    slug,
    title: slug,
    description: null,
    imageUrl: null,
    startAt: null,
    endAt: null,
    isFree: false,
    priceMin: null,
    url,
  };

  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return empty;

    const $ = cheerio.load(await res.text());

    const title = $("h1").first().text().trim() || slug;
    const description = $("meta[name='description']").attr("content") ?? null;
    const imageUrl = $("meta[property='og:image']").attr("content") ?? null;

    // Find a heading that contains a month name — Autograph uses headings like
    // "16 September – 15 November 2025" or dates separated by " || "
    const dateText = ((): string | null => {
      let found: string | null = null;
      $("h2, h3, h4, p").each((_, el) => {
        if (found) return;
        const text = $(el).text().trim();
        if (/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(text)) {
          found = text;
        }
      });
      return found;
    })();

    let startAt: string | null = null;
    let endAt: string | null = null;

    if (dateText) {
      // "16 September – 15 November 2025" or "16 September 2025 || 6pm – 9pm"
      const parts = dateText.split(/\s*(?:–|-|\|\|)\s*/);
      const startDate = parseDMY(parts[0]);
      if (startDate) {
        // Check if parts[1] looks like a time rather than a date
        if (parts[1] && /\d{1,2}[:.]\d{2}|\d{1,2}\s*[ap]m/i.test(parts[1])) {
          const timeResult = parseTime(parts[1].trim());
          if (timeResult) {
            const withTime = applyTime(startDate, parts[1].trim());
            startAt = withTime.toISOString();
            if (parts[2]) {
              const endTime = applyTime(startDate, parts[2].trim());
              endAt = endTime.toISOString();
            }
          } else {
            startAt = startDate.toISOString();
          }
        } else {
          startAt = startDate.toISOString();
          if (parts[1]) {
            const endDate = parseDMY(parts[1], startDate.getFullYear());
            if (endDate) endAt = endDate.toISOString();
          }
        }
      }
    }

    // Price detection from body text
    const bodyText = $("body").text();
    const priceMatch = bodyText.match(/£(\d+(?:\.\d{2})?)/);
    const isFree = /\bfree\b/i.test(bodyText);
    const priceMin = priceMatch ? parseFloat(priceMatch[1]) : null;

    return { slug, title, description, imageUrl, startAt, endAt, isFree, priceMin, url };
  } catch {
    return empty;
  }
}

export async function fetchAutographEvents(): Promise<AutographRawEvent[]> {
  const slugs = await fetchEventSlugs();
  return mapWithConcurrency(slugs, 3, fetchEventDetail);
}

export function normaliseAutographEvent(raw: AutographRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Autograph event ${raw.slug} has no start date`);

  return {
    title: raw.title || "Untitled event",
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Autograph ABP", sourceType: "autograph", profileUrl: BASE_URL },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: raw.priceMin,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "autograph", id: raw.slug, url: raw.url },
  };
}
