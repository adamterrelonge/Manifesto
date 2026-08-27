import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// DCA (Dundee Contemporary Arts). robots.txt fully permissive. `/whats-on`
// 301-redirects to the homepage — that's the only usable listing page
// (`/events/` returns 200 but has zero card markup, confirmed empty).
//
// Every promoted item on the homepage — regardless of which curated section
// it's under ("Now open", "Booking now", a festival's own section, or the
// separate "Upcoming events" grid — visually a different layout but the
// same markup underneath) — shares one identical card shape, so a single
// flat `a.slot` selector covers all of them:
//   <a href="FULL_URL" class="slot">
//     <div class="slot-content"><div class="slot-content-inner">
//       <h3 class="slot-title ...">TITLE</h3>
//       <div class="slot-date">Sat 22 Aug - Sun 15 Nov 2026</div>  (or a
//         single date "Sun 6 Sep 2026" — both parsed the same way)
// A third of the slots on the page are permanent nav/donate/voucher
// promos with an empty title and/or no `.slot-date` at all (confirmed
// live: 5 of 15) — skipped naturally since both an empty title and an
// unparseable/missing date already fail the checks below. Separately, the
// "News and stories" section (`section.block-combi-grid`) also renders its
// articles as `a.slot` cards with a `.slot-date` — but that date is the
// article's publish date, not an event date (e.g. a "Games announced for
// Drop in and Play" news post dated in the past). Every real event links
// to `/events/...`, every news post to `/news/...`, so filtering on that
// URL path excludes the news section without needing a DOM-ancestor check.
const BASE_URL = "https://www.dca.org.uk";
const LISTING_URL = `${BASE_URL}/`;

const VENUE = {
  name: "DCA (Dundee Contemporary Arts)",
  address: "152 Nethergate",
  city: "Dundee",
  region: "Dundee City",
  postcode: "DD1 4DY",
  lat: 56.457094,
  lng: -2.974713,
};

export interface DcaRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string | null;
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

// "Sat 22 Aug - Sun 15 Nov 2026" or a single "Fri 9 Oct 2026" — never
// carries more than one year, so one shared year (if present) covers both
// sides same as this codebase's other free-text adapters.
function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const yearMatch = clean.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const parts = clean.split(/\s*[–—-]\s*/);

  const start = parseDMY(parts[0], year);
  const end = parts.length >= 2 ? parseDMY(parts[1], year) : null;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): DcaRawEvent[] {
  const $ = cheerio.load(html);
  const events: DcaRawEvent[] = [];
  const seen = new Set<string>();

  $("a.slot").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || !slug.startsWith("events/") || seen.has(slug)) return;

    const title = $card.find(".slot-title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".slot-date").first().text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;
    seen.add(slug);

    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt,
      endAt,
      url: href,
    });
  });

  return events;
}

export async function fetchDcaEvents(): Promise<DcaRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`DCA listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseDcaEvent(raw: DcaRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`DCA event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "DCA (Dundee Contemporary Arts)",
      sourceType: "dca",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "dca", id: raw.slug, url: raw.url },
  };
}
