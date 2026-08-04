import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

// Shape Arts is disability-led and has no single fixed venue — "Shape's
// Calendar" lists upcoming events/exhibitions from Shape's own programme
// as well as from artists and partner venues Shape has supported, so each
// listing card carries its own free-text "Location:" line (sometimes a
// full address, sometimes just a venue + city, sometimes "Online"). All
// the data we need (title, dates, description, location) is present on
// the listing page itself via schema.org/Event microdata — no detail-page
// fetch required. robots.txt does not block ManifestoEventsBot.

const BASE_URL = "https://www.shapearts.org.uk";
const LISTING_URL = `${BASE_URL}/pages/events/category/events`;

const UK_POSTCODE_RE = /([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\s*$/i;

export interface ShapeArtsRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  locationText: string | null;
  url: string;
}

// "Marina Theatre, Marina Lowestoft, Suffolk, NR32 1HH" / "The Chiswick
// Cinema, London" / "Online". Venue-name/city split is a best-effort
// heuristic over free text from an unbounded set of partner venues — no
// per-event lat/lng is available, so it's left null rather than guessed.
function parseLocation(raw: string | null): NormalisedVenue | null {
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean || /^online$/i.test(clean)) return null;

  const postcodeMatch = clean.match(UK_POSTCODE_RE);
  const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : null;
  const withoutPostcode = postcodeMatch
    ? clean.slice(0, postcodeMatch.index).replace(/,\s*$/, "").trim()
    : clean;

  const parts = withoutPostcode
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  return {
    name: parts[0],
    address: parts.length > 2 ? parts.slice(1, -1).join(", ") : null,
    city: parts.length > 1 ? parts[parts.length - 1] : null,
    region: null,
    postcode,
    lat: null,
    lng: null,
  };
}

export async function fetchShapeArtsEvents(): Promise<ShapeArtsRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Shape Arts listing error: ${res.status} ${res.statusText}`);

  const $ = cheerio.load(await res.text());
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const events: ShapeArtsRawEvent[] = [];

  $(".listedEvent").each((_, el) => {
    (function (node: typeof el) {
      const $card = $(node);

      const linkEl = $card.find("h2[itemprop='name'] a").first();
      const title = linkEl.text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const href = linkEl.attr("href") ?? "";
      const slugMatch = href.match(/\/events\/([^/?#]+)/i);
      const slug = slugMatch ? slugMatch[1] : null;
      if (!slug) return;
      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      const $summary = $card.find("p.postSummary[itemprop='description']").first().clone();
      $summary.find(".readMore").remove();
      const description = $summary.text().replace(/\s+/g, " ").trim() || null;

      const imgSrc = $card.find("img[itemprop='image']").first().attr("src") ?? null;
      const imageUrl = imgSrc
        ? imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`
        : null;

      const startRaw = $card.find("time[itemprop='startDate']").first().attr("datetime") ?? null;
      const endRaw = $card.find("time[itemprop='endDate']").first().attr("datetime") ?? null;
      const startDate = startRaw ? new Date(startRaw) : null;
      const endDate = endRaw ? new Date(endRaw) : null;
      const startAt = startDate && !isNaN(startDate.getTime()) ? startDate.toISOString() : null;
      const endAt = endDate && !isNaN(endDate.getTime()) ? endDate.toISOString() : null;
      if (!startAt) return;

      const isVisible = endDate
        ? endDate >= now
        : startDate
          ? startDate >= sevenDaysAgo
          : false;
      if (!isVisible) return;

      const locationText =
        $card.find("p.locationDetails span").first().text().replace(/\s+/g, " ").trim() || null;

      events.push({
        slug,
        title,
        description,
        imageUrl,
        startAt,
        endAt,
        isFree: /\bfree\b/i.test($card.text()),
        locationText,
        url,
      });
    })(el);
  });

  return events;
}

export function normaliseShapeArtsEvent(raw: ShapeArtsRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Shape Arts event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: parseLocation(raw.locationText),
    organiser: {
      name: "Shape Arts",
      sourceType: "shape-arts",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "shape-arts", id: raw.slug, url: raw.url },
  };
}
