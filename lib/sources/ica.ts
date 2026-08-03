import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY, parseTime, applyTime, mapWithConcurrency } from "./scrape-utils";

const BASE_URL = "https://www.ica.art";
const DAYS_AHEAD = 14;
const DAY_FETCH_CONCURRENCY = 5;

const VENUE = {
  name: "ICA",
  address: "The Mall",
  city: "London",
  region: "Greater London",
  postcode: "SW1Y 5AH",
  lat: 51.5064,
  lng: -0.1304,
};

const PATH_CATEGORY: Record<string, Category> = {
  films: "film",
  live: "theatre-performance",
  "talks-and-events": "workshop-talk",
};

const EVENT_HREF_RE = /^\/(films|live|talks-and-events)\/([^/?]+)/;

export interface IcaRawEvent {
  slug: string;
  section: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function buildDayUrls(): string[] {
  const urls: string[] = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    urls.push(`${BASE_URL}/events/${yyyy}-${mm}-${dd}`);
  }
  return urls;
}

interface DayPageEvent {
  slug: string;
  section: string;
  title: string;
  imageUrl: string | null;
  timeText: string | null;
  isFree: boolean;
  url: string;
}

interface DayResult {
  date: Date;
  events: DayPageEvent[];
}

async function fetchDayPage(url: string): Promise<DayResult | null> {
  const dateMatch = url.match(/(\d{4})-(\d{2})-(\d{1,2})$/);
  if (!dateMatch) return null;
  const date = new Date(
    parseInt(dateMatch[1], 10),
    parseInt(dateMatch[2], 10) - 1,
    parseInt(dateMatch[3], 10)
  );

  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return null;

    const $ = cheerio.load(await res.text());
    const events: DayPageEvent[] = [];
    const seen = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const m = href.match(EVENT_HREF_RE);
      if (!m) return;

      const section = m[1];
      const slug = m[2];
      const key = `${section}/${slug}`;
      if (seen.has(key)) return;
      seen.add(key);

      const $card = $(el);
      const title = $card.find("h2, h3, h4").first().text().trim() || $card.text().trim();
      if (!title) return;

      const imageEl = $card.find("img").first();
      let imageUrl = imageEl.attr("src") ?? imageEl.attr("data-src") ?? null;
      if (imageUrl?.startsWith("//")) imageUrl = `https:${imageUrl}`;

      let timeText: string | null = null;
      $card.find("p, span, time").each((_, p) => {
        if (timeText) return;
        const t = $(p).text().trim();
        if (/\d{1,2}:\d{2}\s*[AP]M/i.test(t)) timeText = t;
      });

      const isFree = /\bfree\b/i.test($card.text());
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      events.push({ slug, section, title, imageUrl, timeText, isFree, url: fullUrl });
    });

    return { date, events };
  } catch {
    return null;
  }
}

export async function fetchIcaEvents(): Promise<IcaRawEvent[]> {
  const dayUrls = buildDayUrls();
  const dayResults = await mapWithConcurrency(dayUrls, DAY_FETCH_CONCURRENCY, fetchDayPage);

  const seen = new Map<string, IcaRawEvent>();

  for (const result of dayResults) {
    if (!result) continue;
    const { date, events } = result;

    for (const ev of events) {
      const key = `${ev.section}/${ev.slug}`;
      if (seen.has(key)) continue;

      let startAt: string | null = null;
      if (ev.timeText) {
        startAt = applyTime(date, ev.timeText).toISOString();
      } else {
        startAt = date.toISOString();
      }

      seen.set(key, {
        slug: ev.slug,
        section: ev.section,
        title: ev.title,
        description: null,
        imageUrl: ev.imageUrl,
        startAt,
        endAt: null,
        isFree: ev.isFree,
        url: ev.url,
      });
    }
  }

  return [...seen.values()];
}

export function normaliseIcaEvent(raw: IcaRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`ICA event ${raw.slug} has no start date`);

  const category: Category | null = PATH_CATEGORY[raw.section] ?? null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "ICA", sourceType: "ica", profileUrl: BASE_URL },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "ica", id: `${raw.section}/${raw.slug}`, url: raw.url },
  };
}
