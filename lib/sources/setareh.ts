import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// Setareh is a 3-city gallery group (Dusseldorf, Berlin, London) sharing
// one exhibitions listing page — filtered to London only below. robots.txt
// permissive (just a sitemap line). /exhibitions (270KB) is a server-
// rendered Webflow CMS collection, no client-side hydration needed.
//
// Card shape (each city's current show is one card in the same list):
//   <div role="listitem" class="exhibition-item w-dyn-item">
//     <a href="https://www.setareh.com/ovr/SLUG" class="exhibition-linkblock w-inline-block">
//       <div class="current-exhibition-wrapper">
//         <div class="exhibition-img-wrapper"><img src="..."></div>
//         <div class="exhibition-info-wrapper">
//           <div class="exhibition-name">LOOK</div>                        (show title only, not artist)
//           <div class="werkname-ovr left exhibition-artists">Brent McKeever</div>
//           <div class="werkname-ovr">17.07. – 05.09.2026</div>            (day.month. - day.month.year, year only on the end)
//         </div>
//         <div class="exhibition-location-wrapper">
//           <div class="gallery-name">SETAREH</div>
//           <div class="gallery-location">London</div>                    (also "Dusseldorf" / "Berlin" - filtered out)
//         </div>
//       </div>
//     </a>
//     ...current-exhibition-slider sibling (image carousel, not card data)...
//   </div>
// The date div and the artist div both carry the "werkname-ovr" class, so
// the date one is selected as ":not(.exhibition-artists)" to tell them apart.

const BASE_URL = "https://www.setareh.com";
const LISTING_URL = `${BASE_URL}/exhibitions`;

const VENUE = {
  name: "Setareh",
  address: "2 Bourdon Street, Mayfair",
  city: "London",
  region: "Greater London",
  postcode: "W1K 3PA",
  lat: 51.510633,
  lng: -0.146816,
};

export interface SetarehRawEvent {
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

// "17.07. – 05.09.2026" (range, year only on the end) or "17.07.2026"
// (single date, both day.month.year, dot-separated European style).
function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();

  const range = clean.match(
    /(\d{1,2})\.(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/
  );
  if (range) {
    const [, sd, sm, ed, em, ey] = range;
    const year = parseInt(ey, 10);
    const start = new Date(year, parseInt(sm, 10) - 1, parseInt(sd, 10));
    const end = new Date(year, parseInt(em, 10) - 1, parseInt(ed, 10));
    return {
      startAt: isNaN(start.getTime()) ? null : start.toISOString(),
      endAt: isNaN(end.getTime()) ? null : end.toISOString(),
    };
  }

  const single = clean.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (single) {
    const [, d, m, y] = single;
    const start = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    return { startAt: isNaN(start.getTime()) ? null : start.toISOString(), endAt: null };
  }

  return { startAt: null, endAt: null };
}

function parseListingPage(html: string): SetarehRawEvent[] {
  const $ = cheerio.load(html);
  const events: SetarehRawEvent[] = [];
  const seen = new Set<string>();

  $("div.exhibition-item").each((_, el) => {
    const $card = $(el);

    const location = $card.find(".gallery-location").first().text().trim();
    if (!/london/i.test(location)) return;

    const $link = $card.find("a.exhibition-linkblock[href]").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const name = $card.find(".exhibition-name").first().text().replace(/\s+/g, " ").trim();
    const artist = $card
      .find(".exhibition-artists")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const title = artist && name ? `${artist} — ${name}` : name || artist;
    if (!title) return;

    const dateText = $card
      .find(".werkname-ovr")
      .not(".exhibition-artists")
      .first()
      .text();
    const { startAt, endAt } = parseDateRange(dateText);
    if (!startAt) return;

    const imageUrl = $card.find("img").first().attr("src") ?? null;

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

export async function fetchSetarehEvents(): Promise<SetarehRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Setareh listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseSetarehEvent(raw: SetarehRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Setareh event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Setareh", sourceType: "setareh", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "setareh", id: raw.slug, url: raw.url },
  };
}
