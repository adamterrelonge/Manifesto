import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Brighton. robots.txt has no Disallow rules (just the new "content
// signals" boilerplate, no AI-bot block). /whats-on/exhibitions?
// upcoming (the "Upcoming" tab, the default view) returns real
// server-rendered cards, no client-side rendering needed.
//
// Card shape (no repeating wrapper class — the outer `<a>` itself is the
// card root, matched by its href prefix rather than a class):
//   <a class="no-underline" href="/exhibitions/SLUG">
//     <img src="...">
//     <div class="mini-header ..."><h4>Exhibitions</h4></div>
//     <h2>TITLE</h2>
//     <h3>ARTIST</h3>   (not used as a separate field — h2 alone is the title)
//     <div class="text-dovegray font-lineara">DATE TEXT</div>
//   </a>
// Date text is free text in two shapes, both with messy internal
// whitespace/newlines around a literal "to":
//   "22 June  to  30 September 2026"   (range, start has no year)
//   "8 October 2026"                   (single date, no range)

const BASE_URL = "https://fabrica.org.uk";
const LISTING_URL = `${BASE_URL}/whats-on/exhibitions`;

const VENUE = {
  name: "Fabrica",
  address: "Duke Street",
  city: "Brighton",
  region: "East Sussex",
  postcode: "BN1 1AG",
  lat: 50.822916,
  lng: -0.142843,
};

export interface FabricaRawEvent {
  slug: string;
  title: string;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

function slugFromUrl(url: string): string {
  return url.replace(/^\/+|\/+$/g, "");
}

// "22 June  to  30 September 2026" / "8 October 2026"
function parseDateText(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return { startAt: null, endAt: null };

  const parts = clean.split(/\s+to\s+/i);
  if (parts.length === 1) {
    const start = parseDMY(parts[0]);
    return { startAt: start ? start.toISOString() : null, endAt: null };
  }

  const yearMatch = parts[1].match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
  const start = parseDMY(parts[0], year);
  const end = parseDMY(parts[1], year);

  return {
    startAt: start ? start.toISOString() : null,
    endAt: end ? end.toISOString() : null,
  };
}

function parseListingPage(html: string): FabricaRawEvent[] {
  const $ = cheerio.load(html);
  const events: FabricaRawEvent[] = [];
  const seen = new Set<string>();

  $('a.no-underline[href^="/exhibitions/"]').each((_, el) => {
    const $card = $(el);
    const href = $card.attr("href") ?? "";
    const slug = slugFromUrl(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $card.find("h2").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const dateText = $card.find(".text-dovegray.font-lineara").first().text();
    const { startAt, endAt } = parseDateText(dateText);
    if (!startAt) return;

    const img = $card.find("img").first().attr("src") ?? null;
    const imageUrl = img ? (img.startsWith("http") ? img : `${BASE_URL}${img}`) : null;

    events.push({
      slug,
      title,
      imageUrl,
      startAt,
      endAt,
      url: `${BASE_URL}${href}`,
    });
  });

  return events;
}

export async function fetchFabricaEvents(): Promise<FabricaRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Fabrica listing error: ${res.status} ${res.statusText}`);
  return parseListingPage(await res.text());
}

export function normaliseFabricaEvent(raw: FabricaRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Fabrica event ${raw.slug} has no start date`);

  return {
    title: raw.title,
    description: null,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Fabrica", sourceType: "fabrica", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "fabrica", id: raw.slug, url: raw.url },
  };
}
