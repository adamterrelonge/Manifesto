import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// mac Birmingham (Midlands Arts Centre), Cannon Hill Park. robots.txt
// permissive, /whats-on/exhibitions returns a clean 200. Server-rendered,
// unpaginated (10 cards across "Showing now" + "Upcoming" sections). Card
// shape:
//   <li class="o-grid__item ..."><a class="c-media ..." href="...">
//     <div class="c-media__image"><img class="o-image__img" src="..."></div>
//     <h3 class="c-media__title">Title</h3>
//     <span class="c-media__posttitle">Exhibition</span>
//     <time class="c-media__datetime">
//       <time class="o-time" datetime="2026-04-18T00:00:00+01:00" itemprop="startDate">Sat 18 Apr</time>
//       – <time class="o-time" datetime="2026-08-31T00:00:00+01:00" itemprop="endDate">Mon 31 Aug</time>
//     </time>
//   </a></li>
// Real ISO datetime attributes directly on the nested <time> elements — no
// text parsing needed. No inline description on the listing cards.

const BASE_URL = "https://macbirmingham.co.uk";
const LISTING_URL = `${BASE_URL}/whats-on/exhibitions`;

const VENUE = {
  name: "mac Birmingham",
  address: "Cannon Hill Park",
  city: "Birmingham",
  region: "West Midlands",
  postcode: "B12 9QH",
  lat: 52.452878,
  lng: -1.903832,
};

export interface MacBirminghamRawEvent {
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

function toIso(datetime: string | undefined): string | null {
  if (!datetime) return null;
  const d = new Date(datetime);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseListingPage(html: string): MacBirminghamRawEvent[] {
  const $ = cheerio.load(html);
  const events: MacBirminghamRawEvent[] = [];
  const seen = new Set<string>();

  $("a.c-media").each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find(".c-media__title").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const startAt = toIso($card.find('time[itemprop="startDate"]').first().attr("datetime"));
    if (!startAt) return;
    const endAt = toIso($card.find('time[itemprop="endDate"]').first().attr("datetime"));

    const tag =
      $card.find(".c-media__posttitle").first().text().replace(/\s+/g, " ").trim().toLowerCase() ||
      null;

    const imageUrl = $card.find("img.o-image__img").first().attr("src") ?? null;
    const isFree = /\bfree\b/i.test($card.text());

    events.push({
      slug,
      title,
      tag,
      imageUrl,
      isFree,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchMacBirminghamEvents(): Promise<MacBirminghamRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`mac Birmingham listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseMacBirminghamEvent(raw: MacBirminghamRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`mac Birmingham event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "mac Birmingham",
      sourceType: "mac-birmingham",
      profileUrl: LISTING_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "mac-birmingham", id: raw.slug, url: raw.url },
  };
}
