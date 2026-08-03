import * as cheerio from "cheerio";
import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import { REQUEST_HEADERS } from "./scrape-utils";

const BASE_URL = "https://www.africacentre.org.uk";
const LISTING_URL = `${BASE_URL}/Pages/Events/Category/what-s-on`;

export interface AfricaCentreRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  priceMin: number | null;
  venue: NormalisedVenue | null;
  url: string;
}

// Datetime attrs look like "2026-08-07T12:00" — use date only; the T12:00 is a CMS placeholder.
function parseAttrDatetime(s: string | undefined): string | null {
  if (!s) return null;
  const datePart = s.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const d = new Date(`${datePart}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// "Barbican Centre , Silk Street, , London , EC2Y 8DS" → NormalisedVenue
function parseVenueString(raw: string): NormalisedVenue | null {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];
  const isPostcode = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}$/i.test(last);
  const postcode = isPostcode ? last : null;
  const rest = isPostcode ? parts.slice(0, -1) : parts;

  const city = rest.length > 0 ? rest[rest.length - 1] : null;
  const beforeCity = rest.slice(0, -1);

  const name = beforeCity.length > 0 ? beforeCity[0] : (city ?? raw.trim());
  const address = beforeCity.length > 1 ? beforeCity.slice(1).join(", ") : null;

  return { name, address, city, region: null, postcode, lat: null, lng: null };
}

export async function fetchAfricaCentreEvents(): Promise<AfricaCentreRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Africa Centre listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const events: AfricaCentreRawEvent[] = [];

  $("section[itemtype='http://schema.org/Event']").each((_, el) => {
    (function (node: typeof el) {
      const $card = $(node);

      const href = $card.find("a[itemprop='url']").first().attr("href") ?? "";
      if (!href) return;

      const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      const slug = href.replace(/^\/Events\//, "").replace(/\/$/, "");

      const title = $card.find("[itemprop='name'] a").first().text().trim();
      if (!title) return;

      // Strip the inline "Read more" button before taking description text
      const $descEl = $card.find("p.postSummary[itemprop='description']").first();
      $descEl.find(".readMore").remove();
      const description = $descEl.text().trim() || null;

      const startAt = parseAttrDatetime(
        $card.find("time[itemprop='startDate']").attr("datetime")
      );
      const endAt = parseAttrDatetime(
        $card.find("time[itemprop='endDate']").attr("datetime")
      );

      const imgSrc = $card.find("img[itemprop='image']").attr("src") ?? null;
      const imageUrl = imgSrc
        ? imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`
        : null;

      const locationRaw = $card.find("p.locationDetails span").first().text().trim();
      const venue = locationRaw ? parseVenueString(locationRaw) : null;

      const bodyText = $card.text();
      const priceMatch = bodyText.match(/£(\d+(?:\.\d{2})?)/);
      const isFree = /\bfree\b/i.test(bodyText);
      const priceMin = priceMatch ? parseFloat(priceMatch[1]) : null;

      events.push({
        slug,
        title,
        description,
        imageUrl,
        startAt,
        endAt,
        isFree,
        priceMin,
        venue,
        url,
      });
    })(el);
  });

  return events;
}

export function normaliseAfricaCentreEvent(raw: AfricaCentreRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Africa Centre event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: raw.venue,
    organiser: {
      name: "Africa Centre",
      sourceType: "africa-centre",
      profileUrl: BASE_URL,
    },
    category: null,
    isFree: raw.isFree,
    priceMin: raw.priceMin,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "africa-centre", id: raw.slug, url: raw.url },
  };
}
