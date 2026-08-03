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

// Returns "/events/slug" paths from the /events listing page.
async function fetchEventPaths(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/events`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Autograph events listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const paths = new Set<string>();

  $("a[href^='/events/']").each((_, el) => {
    const href = $(el).attr("href")!;
    const slug = href.replace(/^\/events\//, "").replace(/\/$/, "");
    if (slug && !slug.includes("/")) paths.add(`/events/${slug}`);
  });

  return [...paths];
}

// Returns "/exhibitions/slug" paths from the /exhibitions listing page.
async function fetchExhibitionPaths(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/exhibitions`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Autograph exhibitions listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const paths = new Set<string>();

  $("a[href^='/exhibitions/']").each((_, el) => {
    const href = $(el).attr("href")!;
    const slug = href.replace(/^\/exhibitions\//, "").replace(/\/$/, "");
    if (slug && !slug.includes("/")) paths.add(`/exhibitions/${slug}`);
  });

  return [...paths];
}

// Fetches a detail page at any Autograph path (/events/slug or /exhibitions/slug).
// Exhibition slugs are prefixed "exhibitions/" so their source IDs don't collide with events.
async function fetchDetail(path: string): Promise<AutographRawEvent> {
  const isExhibition = path.startsWith("/exhibitions/");
  const slug = isExhibition
    ? "exhibitions/" + path.replace(/^\/exhibitions\//, "").replace(/\/$/, "")
    : path.replace(/^\/events\//, "").replace(/\/$/, "");

  const url = `${BASE_URL}${path}`;
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

    // Find the first heading that contains a month name
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
      const parts = dateText.split(/\s*(?:–|-|\|\|)\s*/);
      const startDate = parseDMY(parts[0]);
      if (startDate) {
        if (parts[1] && /\d{1,2}[:.]\d{2}|\d{1,2}\s*[ap]m/i.test(parts[1])) {
          const timeResult = parseTime(parts[1].trim());
          if (timeResult) {
            startAt = applyTime(startDate, parts[1].trim()).toISOString();
            if (parts[2]) endAt = applyTime(startDate, parts[2].trim()).toISOString();
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
  const [eventPaths, exhibitionPaths] = await Promise.all([
    fetchEventPaths(),
    fetchExhibitionPaths(),
  ]);
  const allPaths = [...new Set([...eventPaths, ...exhibitionPaths])];
  return mapWithConcurrency(allPaths, 3, fetchDetail);
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
