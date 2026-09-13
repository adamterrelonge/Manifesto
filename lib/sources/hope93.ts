import { cheerio, REQUEST_HEADERS, parseDMY } from "./scrape-utils";
import type { NormalisedEvent } from "@/lib/types";

// Hope93, 54 Eastcastle Street (Fitzrovia), London. robots.txt only has
// defensive rules (/admin/, /api/), no AI-bot blocks. Artlogic-CMS-family
// site, but /exhibitions/ IS server-rendered (confirmed live) — unlike
// tristan-hoare-gallery.ts's Artlogic instance, which is client-hydrated.
//
// Card shape (`ul.clearwithin > li > a[href^="/exhibitions/"]`):
//   <li class="..."><a href="/exhibitions/25-major-attractions-ramone-k-anderson/">
//     <span class="image">...</span>
//     <div class="content">
//       <h2>MAJOR ATTRACTIONS </h2>
//       <span class="subtitle">Ramone 'K' Anderson </span>
//       <span class="date">9 Sep - 3 Oct 2026</span>
//     </div>
//   </a></li>
// Title (h2) and artist (.subtitle) are separate fields — combined here as
// "Title — Artist" (subtitle is often blank for group shows, e.g. "AD
// INTERIM - Guest Curator Yasmine Helou"). Free-text `.date`, three shapes:
// a single date ("27 Mar 2026"), a day-only start sharing the end's month/
// year ("21 - 26 Mar 2025"), and a full "D Mon [YYYY] - D Mon YYYY" range
// (start's own year used when present, otherwise borrowed from the end —
// same technique as leicester-museums.ts). 18 cards on one unpaginated
// fetch, going back to 2024 — left as-is for downstream expiry, same as
// every other adapter here.

const BASE_URL = "https://hope93.com";
const LISTING_URL = `${BASE_URL}/exhibitions/`;

const VENUE = {
  name: "Hope93",
  address: "54 Eastcastle Street",
  city: "London",
  region: "Greater London",
  postcode: "W1W 8DJ",
  lat: 51.516656,
  lng: -0.138634,
};

export interface Hope93RawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "").replace(/^exhibitions\//, "") || "home";
}

// "27 Mar 2026" (single date), "21 - 26 Mar 2025" (day-only start), or
// "9 Sep - 3 Oct 2026" / "11 Jul 2025 - 8 Jan 2026" (full range, start's
// year borrowed from the end only when its own isn't present).
function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const dashMatch = clean.match(/^(.+?)\s*[–—-]\s*(.+)$/);
  if (!dashMatch) {
    const single = parseDMY(clean);
    return { startAt: single ? single.toISOString() : null, endAt: null };
  }

  const [, leftRaw, rightRaw] = dashMatch;
  const end = parseDMY(rightRaw);
  if (!end) return { startAt: null, endAt: null };

  const dayOnly = leftRaw.trim().match(/^(\d{1,2})$/);
  const start = dayOnly
    ? new Date(end.getFullYear(), end.getMonth(), parseInt(dayOnly[1], 10))
    : parseDMY(leftRaw, end.getFullYear());

  return { startAt: (start ?? end).toISOString(), endAt: end.toISOString() };
}

function parseListingPage(html: string): Hope93RawEvent[] {
  const $ = cheerio.load(html);
  const events: Hope93RawEvent[] = [];
  const seen = new Set<string>();

  $('ul.clearwithin li a[href^="/exhibitions/"]').each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const heading = $card.find(".content h2").first().text().replace(/\s+/g, " ").trim();
    const subtitle = $card.find(".content .subtitle").first().text().replace(/\s+/g, " ").trim();
    if (!heading) return;
    const title = subtitle ? `${heading} — ${subtitle}` : heading;

    const dateText = $card.find(".content .date").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const img = $card.find("img").first();
    const imageUrl = img.attr("data-src") ?? (img.attr("src")?.startsWith("data:") ? null : img.attr("src")) ?? null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchHope93Events(): Promise<Hope93RawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Hope93 listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseHope93Event(raw: Hope93RawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Hope93 event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Hope93", sourceType: "hope93", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "hope93", id: raw.slug, url: raw.url },
  };
}
