import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY, parseTime, applyTime } from "./scrape-utils";

const BASE_URL = "https://www.horniman.ac.uk";

const VENUE = {
  name: "Horniman Museum and Gardens",
  address: "100 London Road",
  city: "London",
  region: "Greater London",
  postcode: "SE23 3PQ",
  lat: 51.4428,
  lng: -0.0574,
};

const CATEGORY_MAP: Record<string, Category> = {
  exhibition: "gallery-exhibition",
  exhibitions: "gallery-exhibition",
  talk: "workshop-talk",
  talks: "workshop-talk",
  workshop: "workshop-talk",
  workshops: "workshop-talk",
  film: "film",
  films: "film",
  family: "family-kids",
  "family event": "family-kids",
  "family events": "family-kids",
};

export interface HornimanRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  categoryTag: string | null;
  url: string;
}

export async function fetchHornimanEvents(): Promise<HornimanRawEvent[]> {
  const res = await fetch(`${BASE_URL}/whats-on/`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Horniman listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const events: HornimanRawEvent[] = [];
  const seen = new Set<string>();

  $("a[href*='/event/']").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href) return;

    const slug = href.replace(/^\/+|\/+$/g, "");
    if (seen.has(slug)) return;
    seen.add(slug);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const title = $card.find("h3").first().text().trim();
    if (!title) return;

    const categoryTag =
      $card.find(".tag, .label, .category, [class*='type']").first().text().trim().toLowerCase() ||
      null;

    const imageUrl =
      $card.find("img").first().attr("src") ??
      $card.find("img").first().attr("data-src") ??
      null;

    // Date/time render as dedicated divs (<div class="date">Thu 6 August
    // 2026</div>, <div class="time">6pm – 9:30pm</div>) — not <p>/<span>/
    // <time> tags, which is why the previous "search p, span, time" attempt
    // still matched nothing and every event failed with "no start date"
    // despite the listing links themselves parsing fine. Verified against
    // live markup.
    const dateText = $card.find(".date").first().text().trim() || null;
    const timeText = $card.find(".time").first().text().trim() || null;

    let startAt: string | null = null;
    let endAt: string | null = null;

    if (dateText) {
      const startDate = parseDMY(dateText);
      if (startDate) {
        if (timeText) {
          const timeParts = timeText.split(/\s*[–—-]\s*/);
          const withStart = applyTime(startDate, timeParts[0]);
          startAt = withStart.toISOString();
          if (timeParts[1]) {
            const endTime = parseTime(timeParts[1].trim());
            if (endTime) {
              const endDate = new Date(startDate);
              endDate.setHours(endTime[0], endTime[1], 0, 0);
              endAt = endDate.toISOString();
            }
          }
        } else {
          startAt = startDate.toISOString();
        }
      }
    }

    // No parseable date (rare cards use free-text like "See website for
    // details") — skip rather than push a row normaliseHornimanEvent would
    // just throw on later.
    if (!startAt) return;

    const isFree = /\bfree\b/i.test($card.text());
    const description = $card.find(".excerpt").first().text().trim() || null;

    events.push({ slug, title, description, imageUrl, startAt, endAt, isFree, categoryTag, url });
  });

  return events;
}

export function normaliseHornimanEvent(raw: HornimanRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Horniman event ${raw.slug} has no start date`);

  const category: Category | null = raw.categoryTag
    ? (CATEGORY_MAP[raw.categoryTag] ?? null)
    : null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Horniman Museum and Gardens", sourceType: "horniman", profileUrl: BASE_URL },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "horniman", id: raw.slug, url: raw.url },
  };
}
