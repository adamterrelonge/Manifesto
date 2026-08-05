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

  // Site now runs the "EventPrime" WP plugin (ep-* classes) instead of the old
  // "The Events Calendar" plugin (tribe-* classes / <article> cards). Each event
  // in the list view is a <div class="ep-event-list-item">.
  const $cards = $(".ep-event-list-item, article.tribe-event, article.event, .tribe-event, .event").filter(
    (_, el) => $(el).find("a[href]").length > 0
  );

  $cards.each((_, el) => {
    const $card = $(el);
    // Title/detail-page link: the title itself is a plain <a data-event-id="...">
    // with no wrapping heading tag, so it doubles as both the href and title source.
    const $titleLink = $card.find("a[data-event-id]").first();
    const $link = $titleLink.length ? $titleLink : $card.find("a[href]").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;

    const slug = href.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+|\/+$/g, "");
    if (seen.has(slug)) return;
    seen.add(slug);

    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    const title = $titleLink.length
      ? $titleLink.text().trim()
      : $card.find("h1, h2, h3").first().text().trim();
    if (!title) return;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    let startAt: string | null = null;
    let endAt: string | null = null;

    // Prefer time[datetime] attribute (kept as a defensive fallback; the current
    // EventPrime markup does not render one).
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
      // EventPrime renders the date/time as plain text inside
      // .ep-event-list-view-action, e.g. "Wed, July 15, 2026 - September 6, 2026"
      // or "Thu, August 13, 2026, 11:00 AM".
      let dateText: string | null = null;
      const $actionDate = $card.find(".ep-event-list-view-action, .ep-event-date").first();
      if ($actionDate.length && MONTH_NAME_RE.test($actionDate.text())) {
        dateText = $actionDate.text().trim();
      } else {
        $card.find("p, span, abbr").each((_, p) => {
          if (dateText) return;
          const t = $(p).text().trim();
          if (MONTH_NAME_RE.test(t)) dateText = t;
        });
      }
      if (dateText) {
        const parsed = parseMigrationDate(dateText);
        startAt = parsed.startAt;
        endAt = parsed.endAt;
      }
    }

    const isFree = /\bfree\b/i.test($card.text());
    // Description lives in a dedicated .ep-box-list-desc div (not a <p>).
    const $descDiv = $card.find(".ep-box-list-desc").first();
    const description = $descDiv.length
      ? $descDiv.text().trim() || null
      : $card
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
