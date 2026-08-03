import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, parseTime, applyTime } from "./scrape-utils";

const BASE_URL = "https://www.southlondongallery.org";

const VENUE = {
  name: "South London Gallery",
  address: "65 Peckham Road",
  city: "London",
  region: "Greater London",
  postcode: "SE5 8UH",
  lat: 51.4748,
  lng: -0.0826,
};

export interface SLGRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

// "WED 5 AUG, 6.30-8.30PM" → strip day-of-week, parse date, parse time range
function parseSLGDate(text: string): { startAt: string | null; endAt: string | null } {
  const stripped = text.replace(/^[A-Z]{3,}\s+/i, "").trim();
  const commaParts = stripped.split(",");
  const datePart = commaParts[0]?.trim() ?? "";
  const timePart = commaParts[1]?.trim() ?? null;

  const date = parseDMY(datePart);
  if (!date) return { startAt: null, endAt: null };
  if (!timePart) return { startAt: date.toISOString(), endAt: null };

  const timeRange = timePart.split(/\s*-\s*/);
  const startTimeStr = timeRange[0]?.trim() ?? "";
  const endTimeStr = timeRange[1]?.trim() ?? null;

  const startAt = applyTime(date, startTimeStr).toISOString();

  let endAt: string | null = null;
  if (endTimeStr) {
    const endTime = parseTime(endTimeStr);
    if (endTime) {
      const endDate = new Date(date);
      endDate.setHours(endTime[0], endTime[1], 0, 0);
      endAt = endDate.toISOString();
    }
  }

  return { startAt, endAt };
}

export async function fetchSouthLondonGalleryEvents(): Promise<SLGRawEvent[]> {
  const res = await fetch(`${BASE_URL}/whats-on/`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`South London Gallery listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const events: SLGRawEvent[] = [];
  const seen = new Set<string>();

  $(".event-card, article, li").each((_, el) => {
    const $card = $(el);
    const $link = $card.find("a[href]").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;

    const slug = href.replace(/^\/+|\/+$/g, "");
    if (seen.has(slug)) return;
    seen.add(slug);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const title = $card.find("h2, h3, h4").first().text().trim();
    if (!title) return;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    let dateText: string | null = $card.find(".event-date").first().text().trim() || null;
    if (!dateText) {
      $card.find("p, span, time").each((_, p) => {
        if (dateText) return;
        const t = $(p).text().trim();
        if (/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*/i.test(t)) {
          dateText = t;
        }
      });
    }

    const { startAt, endAt } = dateText
      ? parseSLGDate(dateText)
      : { startAt: null, endAt: null };

    const isFree = /\bfree\b/i.test($card.text());
    const description =
      $card.find("p").filter((_, p) => $(p).text() !== dateText).first().text().trim() || null;

    events.push({ slug, title, description, imageUrl, startAt, endAt, isFree, url });
  });

  return events;
}

export function normaliseSouthLondonGalleryEvent(raw: SLGRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`South London Gallery event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "South London Gallery", sourceType: "south-london-gallery", profileUrl: BASE_URL },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "south-london-gallery", id: raw.slug, url: raw.url },
  };
}
