import type { NormalisedEvent } from "@/lib/types";
import { cheerio, REQUEST_HEADERS } from "./scrape-utils";

// Glasgow. robots.txt only disallows /js/xhr/* — which happens to be
// exactly the endpoint the page's own "Load More" button posts to
// (data-pagination-url="/js/xhr/paginator.php"), so that's respected as a
// real block rather than treated as "unrelated": only the 5 events already
// server-rendered on /whats-on's first load are read, no AJAX pagination.
// Given the app's own display window is ~8 days out anyway, this is ample.
//
// Card shape (`.items-container.js-paginated-items > div`, class
// "exhibition" or "off-site-exhibition"):
//   <span>Exhibition</span>
//   <h2>Title</h2>
//   <p class="additional-info">
//     <time datetime="2026-06-05">5th June 2026</time> -
//     <time datetime="2026-08-30">30th August 2026</time>
//   </p>
//   <a href="/event/slug" class="secondary-cta">View Full Details</a>
// Real ISO dates directly on `<time datetime>`, no text parsing needed.
// "off-site-exhibition" cards (e.g. one physically at Tolbooth, Falkirk) are
// skipped rather than tagged with Street Level's own building address —
// this listing gives no other venue detail for them, and a wrong location
// would be worse than a missing one for "near me" radius matching.

const BASE_URL = "https://www.streetlevelphotoworks.org";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUE = {
  name: "Street Level Photoworks",
  address: "Trongate 103",
  city: "Glasgow",
  region: "Glasgow City",
  postcode: "G1 5HD",
  lat: 55.856983,
  lng: -4.246747,
};

export interface StreetLevelPhotoworksRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "").replace(/^event\//, "");
}

function parseListingPage(html: string): StreetLevelPhotoworksRawEvent[] {
  const $ = cheerio.load(html);
  const events: StreetLevelPhotoworksRawEvent[] = [];
  const seen = new Set<string>();

  $(".items-container.js-paginated-items > div.exhibition").each((_, el) => {
    const $card = $(el);

    const href = $card.find("a.secondary-cta").first().attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h2").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const times = $card.find(".additional-info time[datetime]");
    const startDate = times.eq(0).attr("datetime");
    if (!startDate) return;
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return;

    const endDate = times.eq(1).attr("datetime");
    const end = endDate ? new Date(endDate) : null;

    const bannerStyle = $card.find(".event-item__full-banner").first().attr("style") ?? "";
    const imgMatch = bannerStyle.match(/url\(['"]?(.*?)['"]?\)/);
    const imageUrl = imgMatch ? imgMatch[1] : null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt: start.toISOString(),
      endAt: end && !isNaN(end.getTime()) ? end.toISOString() : null,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchStreetLevelPhotoworksEvents(): Promise<StreetLevelPhotoworksRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Street Level Photoworks listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseStreetLevelPhotoworksEvent(
  raw: StreetLevelPhotoworksRawEvent
): NormalisedEvent {
  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Street Level Photoworks",
      sourceType: "street-level-photoworks",
      profileUrl: LISTING_URL,
    },
    category: "gallery-exhibition",
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "street-level-photoworks", id: raw.slug, url: raw.url },
  };
}
