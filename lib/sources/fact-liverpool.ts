import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// Liverpool (Foundation for Art and Creative Technology). `/whats-on` cards
// carry unix-epoch `data-start`/`data-end` attrs directly on the <article>
// — no date-string parsing needed at all, best find of this round alongside
// mac Birmingham/Firstsite from previous rounds.

const BASE_URL = "https://www.fact.co.uk";
const LISTING_URL = `${BASE_URL}/whats-on`;

const VENUE = {
  name: "FACT Liverpool",
  address: "88 Wood Street",
  city: "Liverpool",
  region: "Merseyside",
  postcode: "L1 4DQ",
  lat: 53.4034,
  lng: -2.9766,
};

export interface FactLiverpoolRawEvent {
  slug: string;
  title: string;
  description: string | null;
  tag: string | null;
  imageUrl: string | null;
  startAt: string;
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

function parseListingPage(html: string): FactLiverpoolRawEvent[] {
  const $ = cheerio.load(html);
  const events: FactLiverpoolRawEvent[] = [];
  const seen = new Set<string>();

  $("article.event[data-start]").each((_, el) => {
    const $card = $(el);

    const $link = $card.find(".event__title a").first();
    const href = $link.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $link.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const startEpoch = parseInt($card.attr("data-start") ?? "", 10);
    if (!Number.isFinite(startEpoch)) return;
    const startAt = new Date(startEpoch * 1000).toISOString();

    const endEpochRaw = $card.attr("data-end");
    const endEpoch = endEpochRaw ? parseInt(endEpochRaw, 10) : NaN;
    const endAt =
      Number.isFinite(endEpoch) && endEpoch !== startEpoch
        ? new Date(endEpoch * 1000).toISOString()
        : null;

    const tag = $card.find(".event__tag").first().text().replace(/\s+/g, " ").trim() || null;
    const description =
      $card.find(".event__excerpt").first().text().replace(/\s+/g, " ").trim() || null;
    const imageUrl = $card.find("img").first().attr("src") ?? null;

    events.push({
      slug,
      title,
      description,
      tag,
      imageUrl,
      startAt,
      endAt,
      url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchFactLiverpoolEvents(): Promise<FactLiverpoolRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`FACT Liverpool listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseFactLiverpoolEvent(raw: FactLiverpoolRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "FACT Liverpool", sourceType: "fact-liverpool", profileUrl: LISTING_URL },
    category: null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "fact-liverpool", id: raw.slug, url: raw.url },
  };
}
