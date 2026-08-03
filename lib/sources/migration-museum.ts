import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseMDY } from "./scrape-utils";

const BASE_URL = "https://www.migrationmuseum.org";

const DEFAULT_VENUE = {
  name: "Migration Museum",
  address: "Lewisham Shopping Centre",
  city: "London",
  region: "Greater London",
  postcode: "SE13 7HB",
  lat: 51.4613,
  lng: -0.0139,
};

export interface MigrationMuseumRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

const MONTH_NAME_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;

// "Wed, July 15, 2026 - September 6, 2026"
function parseMigrationDate(text: string): { startAt: string | null; endAt: string | null } {
  const stripped = text.replace(/^[A-Za-z]+,\s*/, "").trim();
  const parts = stripped.split(/\s*-\s*/);
  const start = parseMDY(parts[0]);
  const end = parts[1] ? parseMDY(parts[1]) : null;
  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

export async function fetchMigrationMuseumEvents(): Promise<MigrationMuseumRawEvent[]> {
  const res = await fetch(`${BASE_URL}/events/`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Migration Museum listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const events: MigrationMuseumRawEvent[] = [];
  const seen = new Set<string>();

  const $cards = $("article.tribe-event, article.event, article, .tribe-event, .event").filter(
    (_, el) => $(el).find("a[href]").length > 0
  );

  $cards.each((_, el) => {
    const $card = $(el);
    const $link = $card.find("a[href]").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;

    const slug = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+|\/+$/g, "");
    if (seen.has(slug)) return;
    seen.add(slug);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const title = $card.find("h1, h2, h3").first().text().trim();
    if (!title) return;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    let startAt: string | null = null;
    let endAt: string | null = null;

    // Prefer time[datetime] attribute
    const $startTime = $card.find("time[datetime]").first();
    if ($startTime.length) {
      const dt = $startTime.attr("datetime");
      if (dt) startAt = new Date(dt).toISOString();
      const $endTime = $card.find("time[datetime]").last();
      if ($endTime.length && $endTime.attr("datetime") !== dt) {
        const endDt = $endTime.attr("datetime");
        if (endDt) endAt = new Date(endDt).toISOString();
      }
    } else {
      let dateText: string | null = null;
      $card.find("p, span, abbr, .tribe-event-date-start, .tribe-event-schedule-details").each((_, p) => {
        if (dateText) return;
        const t = $(p).text().trim();
        if (MONTH_NAME_RE.test(t)) dateText = t;
      });
      if (dateText) {
        const parsed = parseMigrationDate(dateText);
        startAt = parsed.startAt;
        endAt = parsed.endAt;
      }
    }

    const isFree = /\bfree\b/i.test($card.text());
    const description =
      $card
        .find("p")
        .filter((_, p) => !MONTH_NAME_RE.test($(p).text()))
        .first()
        .text()
        .trim() || null;

    events.push({ slug, title, description, imageUrl, startAt, endAt, isFree, url });
  });

  return events;
}

export function normaliseMigrationMuseumEvent(raw: MigrationMuseumRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Migration Museum event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: DEFAULT_VENUE,
    organiser: { name: "Migration Museum", sourceType: "migration-museum", profileUrl: BASE_URL },
    category: "workshop-talk",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "migration-museum", id: raw.slug, url: raw.url },
  };
}
