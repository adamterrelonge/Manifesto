import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY, parseTime, applyTime } from "./scrape-utils";

const BASE_URL = "https://queerbritain.org.uk";

const VENUE = {
  name: "Queer Britain",
  address: "2 Granary Square",
  city: "London",
  region: "Greater London",
  postcode: "N1C 4BH",
  lat: 51.5362,
  lng: -0.1227,
};

// Matches "22 JULY / 6.30PM", "5 August / 2PM", or "19 AUG / FROM 6:30PM"
const DATE_PATTERN = /^(\d{1,2}\s+[A-Za-z]+)\s*\/\s*(?:FROM\s+)?([\d.:]+\s*[AP]M)/i;

export interface QueerBritainRawEvent {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  ticketUrl: string | null;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function fetchQueerBritainEvents(): Promise<QueerBritainRawEvent[]> {
  const res = await fetch(`${BASE_URL}/events`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Queer Britain listing error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const events: QueerBritainRawEvent[] = [];
  const seen = new Set<string>();

  // The site is a page-builder (non-semantic div soup): each event lives in
  // its own <div id="pt-section-canvas-N"> block, with the date/ticket line
  // buried several levels deep in a <span>. .closest("div") only reaches the
  // nearest tiny wrapper div — not the whole event block — so the real <h1>
  // title (a sibling several levels up) was never found and every event got
  // silently dropped. Climbing to the id="pt-section-canvas-*" ancestor
  // first fixes this; falls back to the old behaviour if that id is absent.
  $("*").each((_, el) => {
    const $el = $(el);
    // Only look at leaf-ish containers — skip html/body/div wrappers
    if ($el.children("*").length > 6) return;

    const text = $el.text().trim();
    const dateMatch = text.match(DATE_PATTERN);
    if (!dateMatch) return;

    const $canvas = $el.closest("[id^='pt-section-canvas-']");
    const $container = $canvas.length ? $canvas : $el.closest("article, section, div, li");

    // Multiple <h1> tags exist per block (main title, then a subtitle line
    // like "COFFEE MORNING") — the first non-empty one is the real title.
    let title = "";
    $container.find("h1, h2, h3, h4").each((_, h) => {
      if (title) return;
      const t = $(h).text().trim();
      if (t) title = t;
    });
    if (!title) title = $el.prevAll("h1, h2, h3, h4").first().text().trim();

    if (!title || seen.has(title)) return;
    seen.add(title);

    const id = slugify(title);

    const startDate = parseDMY(dateMatch[1]);
    const imageUrl =
      $container.find("img").first().attr("src") ??
      $container.find("img").first().attr("data-src") ??
      null;

    let startAt: string | null = null;
    if (startDate) {
      const withTime = applyTime(startDate, dateMatch[2]);
      startAt = withTime.toISOString();
    }

    // External ticket link from common platforms
    const ticketLink = $container
      .find("a[href]")
      .filter((_, a) =>
        /outsavvy|eventbrite|ticketmaster|dice\.fm/i.test($(a).attr("href") ?? "")
      )
      .first()
      .attr("href") ?? null;

    const isFree = /\bfree\b/i.test($container.text());

    // Decorative labels ("AUG", "12", "COFFEE MORNING") also live in <p>/<h1>
    // tags within the same block — only a real sentence-length paragraph
    // counts as the description.
    let description: string | null = null;
    $container.find("p").each((_, p) => {
      if (description) return;
      const t = $(p).text().trim();
      if (t.length >= 25) description = t;
    });

    events.push({ id, title, description, imageUrl, startAt, endAt: null, isFree, ticketUrl: ticketLink });
  });

  return events;
}

export function normaliseQueerBritainEvent(raw: QueerBritainRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Queer Britain event "${raw.id}" has no start date`);

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Queer Britain", sourceType: "queer-britain", profileUrl: BASE_URL },
    category: "workshop-talk",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: {
      provider: "queer-britain",
      id: raw.id,
      url: raw.ticketUrl ?? `${BASE_URL}/events`,
    },
  };
}
