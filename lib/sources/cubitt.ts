import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS, applyTime } from "./scrape-utils";

// Cubitt Artists — Islington artist studios/gallery (8 Angel Mews, N1 9HH).
// Runs on the same RIT CMS template family as lib/sources/shape-arts.ts —
// identical `.listedEvent` schema.org/Event markup — but its own
// `<time itemprop='startDate'/'endDate' datetime="...">` attribute has a
// real content bug: PM hours are written as their bare 12-hour digit with
// no +12 conversion (e.g. visible "at 6:00pm" renders as datetime
// "...T06:00", not "...T18:00"). Confirmed across every event on the
// listing page (2pm->T02:00, 5pm->T05:00, 8pm->T08:00, etc, while AM times
// and the date itself are correct) — a systemic template issue, not a
// one-off typo. Only the *date* portion of the attribute is trusted; the
// hour/minute is always re-parsed from the visible "<span>at H:MMam/pm
// </span>" text via applyTime.

const BASE_URL = "https://www.cubittartists.org.uk";
const LISTING_URL = `${BASE_URL}/Pages/Events/Category/upcoming-events/`;

const UK_POSTCODE_RE = /([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\s*$/i;

export interface CubittRawEvent {
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

// "8 Angel Mews, Cubitt Artists, London, N1 9HH" — every event seen so far
// is at Cubitt's own venue, but the template supports arbitrary free text
// here, so this is parsed rather than hardcoded (same approach as
// shape-arts.ts's parseLocation).
function parseLocation(raw: string | null): NormalisedVenue | null {
  if (!raw) return null;
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const postcodeMatch = clean.match(UK_POSTCODE_RE);
  const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase() : null;
  const withoutPostcode = postcodeMatch
    ? clean.slice(0, postcodeMatch.index).replace(/,\s*$/, "").trim()
    : clean;

  const parts = withoutPostcode.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const city = parts.length > 1 ? parts[parts.length - 1] : null;

  return {
    name: parts[0],
    address: parts.length > 2 ? parts.slice(1, -1).join(", ") : null,
    city,
    region: city && /london/i.test(city) ? "Greater London" : null,
    postcode,
    lat: null,
    lng: null,
  };
}

// See file header: date comes from the `datetime` attribute, time from the
// visible "at H:MMam/pm" text, since the attribute's own time is unreliable.
function extractDateTime($time: cheerio.Cheerio<any>): string | null {
  const datetimeAttr = $time.attr("datetime");
  if (!datetimeAttr) return null;
  const [y, m, d] = datetimeAttr.split("T")[0].split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  const base = new Date(y, m - 1, d);

  const timeText = $time.find("span").last().text().trim();
  const timeMatch = timeText.match(/(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))/i);
  const applied = timeMatch ? applyTime(base, timeMatch[1]) : base;
  return isNaN(applied.getTime()) ? null : applied.toISOString();
}

export async function fetchCubittEvents(): Promise<CubittRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Cubitt listing error: ${res.status} ${res.statusText}`);

  const $ = cheerio.load(await res.text());
  const events: CubittRawEvent[] = [];

  $(".listedEvent").each((_, el) => {
    const $card = $(el);

    const linkEl = $card.find("h2[itemprop='name'] a").first();
    const title = linkEl.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const urlEl = $card.find("a[itemprop='url']").first();
    const href = urlEl.attr("href") ?? linkEl.attr("href") ?? "";
    const slugMatch = href.match(/\/events\/([^/?#]+)/i);
    const slug = slugMatch ? slugMatch[1] : null;
    if (!slug) return;
    const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    const $summary = $card.find("p.postSummary[itemprop='description']").first().clone();
    $summary.find(".readMore").remove();
    const description = $summary.text().replace(/\s+/g, " ").trim() || null;

    const imgSrc = $card.find("img[itemprop='image']").first().attr("src") ?? null;
    const imageUrl = imgSrc ? (imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`) : null;

    const startAt = extractDateTime($card.find("time[itemprop='startDate']").first());
    if (!startAt) return;
    const endAt = extractDateTime($card.find("time[itemprop='endDate']").first());

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
  });

  return events;
}

export function normaliseCubittEvent(raw: CubittRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Cubitt event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: parseLocation(raw.locationText),
    organiser: { name: "Cubitt Artists", sourceType: "cubitt", profileUrl: BASE_URL },
    category: null,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "cubitt", id: raw.slug, url: raw.url },
  };
}
