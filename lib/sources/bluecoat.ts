import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { cheerio, REQUEST_HEADERS, parseDMY, applyTime } from "./scrape-utils";

// robots.txt is permissive (only /cpresources/, /vendor/, /.env, /cache/
// disallowed) and /whats-on returns a clean 200 to Node's fetch. The page is
// server-rendered (not an SPA) with two `.c-grid` sections sharing identical
// `.c-grid__item` card markup — the current `.js-paginated-grid` month and a
// "Coming Soon" section below it — both are read as one flat list. There's
// also a JS month-by-month calendar behind "See next month", but the app's
// own display window is only ~8 days out, so the ~9 events already
// server-rendered across both sections are more than enough; no need to
// reverse-engineer that AJAX pagination.
//
// Card shape:
//   <div class="c-grid__item"><a href="...">
//     <div class="text-left ..."><div class="... text-brand-blue">CATEGORY</div>
//     <h2>TITLE</h2><h3>DATE TEXT</h3></div>
//   </a></div>
// Date text is always free text, one of:
//   "Sat 11 July - Sun 06 September 2026, 11:00am - 5:00pm"
//   "Daily from Wed 26 August 2026, 11:00am - 5:00pm"       (ongoing, no end)
//   "from Sat 29 August - Sun 30 August 2026, 11:00am - 4:00pm"
// — a leading "Daily from "/"from " is stripped, the date part before the
// comma is split on a dash for start/end, and the time part after the comma
// is applied on top via scrape-utils' applyTime (these are real event/
// opening times, not just metadata, e.g. the film screening's "6:00pm" is
// its actual start time). No inline description or price on the listing
// cards — left null/false rather than adding a detail-page fetch.

const BASE_URL = "https://www.thebluecoat.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUE = {
  name: "Bluecoat",
  address: "School Lane",
  city: "Liverpool",
  region: "Merseyside",
  postcode: "L1 3BX",
  lat: 53.404179,
  lng: -2.984092,
};

const TAG_CATEGORY: Record<string, Category> = {
  exhibition: "gallery-exhibition",
  family: "family-kids",
  "fair/market": "market-fair",
};

export interface BluecoatRawEvent {
  slug: string;
  title: string;
  tag: string | null;
  imageUrl: string | null;
  isFree: boolean;
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

// "Sat 11 July - Sun 06 September 2026, 11:00am - 5:00pm" and variants —
// see header comment for the full set of shapes observed live.
function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const [datePart, timePart] = clean.split(",").map((s) => s.trim());
  if (!datePart) return { startAt: null, endAt: null };

  const stripped = datePart.replace(/^(daily from|from)\s+/i, "");
  const segments = stripped.split(/\s*[–—-]\s*/);
  const yearMatch = stripped.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  let start = parseDMY(segments[0], year);
  let end = segments.length >= 2 ? parseDMY(segments[1], year) : null;
  if (!start) return { startAt: null, endAt: null };

  if (timePart) {
    const times = timePart.split(/\s*-\s*/);
    if (times[0]) start = applyTime(start, times[0]);
    if (end && times[1]) end = applyTime(end, times[1]);
  }

  return { startAt: start.toISOString(), endAt: end ? end.toISOString() : null };
}

function parseListingPage(html: string): BluecoatRawEvent[] {
  const $ = cheerio.load(html);
  const events: BluecoatRawEvent[] = [];
  const seen = new Set<string>();

  $(".c-grid__item").each((_, el) => {
    const $card = $(el);
    const $link = $card.find("a[href]").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h2").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find("h3").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const tag =
      $card
        .find(".text-brand-blue")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase() || null;

    const imageUrl = $card.find("img").first().attr("data-src") ?? null;
    const isFree = /\bfree\b/i.test(title);

    events.push({
      slug,
      title,
      tag,
      imageUrl: imageUrl ? (imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`) : null,
      isFree,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchBluecoatEvents(): Promise<BluecoatRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Bluecoat listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseBluecoatEvent(raw: BluecoatRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Bluecoat event ${raw.slug} has no start date`);

  const category: Category | null = raw.tag ? TAG_CATEGORY[raw.tag] ?? null : null;

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Bluecoat",
      sourceType: "bluecoat",
      profileUrl: LISTING_URL,
    },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "bluecoat", id: raw.slug, url: raw.url },
  };
}
