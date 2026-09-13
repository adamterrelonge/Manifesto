import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, mapWithConcurrency } from "./scrape-utils";

// Josh Lilley, Fitzrovia. Nuxt SSR (data-server-rendered="true", not a
// client-only SPA). /exhibitions is a flat year-grouped archive grid —
// each card (`a[href^="/exhibitions/"]`) carries artist (`.name`) and
// title (`.italic.v-balance-centered`) but no date at all, so every card
// needs a detail-page fetch, same two-step shape as design-museum.ts.
// Detail page carries the real free-text range in `p.date.josh-lilley`
// ("4 September – 3 October 2026") right next to
// `p.artist-names-large.josh-lilley` (artist) — the exhibition title on
// the same detail page reuses the "artist-names-large" class too (with
// "italic balance-text" instead of "josh-lilley"), so the artist node is
// disambiguated by its own "josh-lilley" class rather than DOM order.

const BASE_URL = "https://joshlilleygallery.com";
const LISTING_URL = `${BASE_URL}/exhibitions`;
const DETAIL_FETCH_CONCURRENCY = 5;

const VENUE = {
  name: "Josh Lilley",
  address: "44-46 Riding House Street",
  city: "London",
  region: "Greater London",
  postcode: "W1W 7EX",
  lat: 51.5186,
  lng: -0.1435,
};

export interface JoshLilleyRawEvent {
  slug: string;
  title: string;
  artist: string | null;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// "4 September – 3 October 2026" (also handles a single bare date). Year
// only ever appears once, on the end side — same shared-year-from-end
// fallback used in leicester-museums.ts/nottingham-contemporary.ts.
function parseExhibitionRange(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s*[–—-]\s*/);
  const end = parseDMY(parts[parts.length - 1]);
  const start = parts.length >= 2 ? parseDMY(parts[0], end?.getFullYear()) : end;

  return {
    startAt: start ? start.toISOString() : null,
    endAt: parts.length >= 2 && end ? end.toISOString() : null,
  };
}

interface ListingCard {
  slug: string;
  title: string;
  artist: string | null;
  url: string;
}

function parseListingPage(html: string): ListingCard[] {
  const $ = cheerio.load(html);
  const cards: ListingCard[] = [];
  const seen = new Set<string>();

  $('a[href^="/exhibitions/"]').each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;

    // The archive grid card is the only shape with both a `.name` (artist)
    // and `.italic.v-balance-centered` (title) child — a handful of other
    // `/exhibitions/...` anchors on the page (e.g. the fullscreen hero
    // swap link) are plain text-only anchors with neither, skipped here.
    const title = $card.find(".italic.v-balance-centered").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;
    seen.add(slug);

    const artist = $card.find("p.name").first().text().replace(/\s+/g, " ").trim() || null;

    cards.push({ slug, title, artist, url: href.startsWith("http") ? href : `${BASE_URL}${href}` });
  });

  return cards;
}

interface DetailResult {
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
}

async function fetchExhibitionDetail(url: string): Promise<DetailResult> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return { description: null, imageUrl: null, startAt: null, endAt: null };

    const $ = cheerio.load(await res.text());
    const dateText = $("p.date.josh-lilley").first().text();
    const { startAt, endAt } = parseExhibitionRange(dateText);

    const description = $(".body .description").first().text().replace(/\s+/g, " ").trim() || null;

    const imgSrc = $(".exhibition-image img, .images img").first().attr("src") ?? null;
    const imageUrl = imgSrc ? imgSrc.split("?")[0] : null;

    return { description, imageUrl, startAt, endAt };
  } catch {
    return { description: null, imageUrl: null, startAt: null, endAt: null };
  }
}

export async function fetchJoshLilleyEvents(): Promise<JoshLilleyRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Josh Lilley listing error: ${res.status} ${res.statusText}`);

  const cards = parseListingPage(await res.text());
  const details = await mapWithConcurrency(cards, DETAIL_FETCH_CONCURRENCY, (c) =>
    fetchExhibitionDetail(c.url)
  );

  const events: JoshLilleyRawEvent[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const d = details[i];
    if (!d.startAt) continue; // unparseable/missing date on the detail page — skip

    events.push({
      slug: c.slug,
      title: c.title,
      artist: c.artist,
      description: d.description,
      imageUrl: d.imageUrl,
      startAt: d.startAt,
      endAt: d.endAt,
      url: c.url,
    });
  }

  return events;
}

export function normaliseJoshLilleyEvent(raw: JoshLilleyRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Josh Lilley event ${raw.slug} has no start date`);

  return {
    title: raw.artist ? `${raw.artist} — ${raw.title}` : raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Josh Lilley", sourceType: "josh-lilley", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "josh-lilley", id: raw.slug, url: raw.url },
  };
}
