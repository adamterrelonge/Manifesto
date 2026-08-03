import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, MONTHS, parseDMY } from "./scrape-utils";

const BASE_URL = "https://gasworks.org.uk";

const VENUE = {
  name: "Gasworks",
  address: "155 Vauxhall Street",
  city: "London",
  region: "Greater London",
  postcode: "SE11 5RH",
  lat: 51.4848,
  lng: -0.1173,
};

export interface GasworksRawEvent {
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

// "1 Oct – 13 Dec 26" / "14 Jan – 21 Mar 27" / "12 Sep 26"
// Date spans in <h2 class="date"> are concatenated before being passed here.
function parseGasworksDate(raw: string): { startAt: string | null; endAt: string | null } {
  const clean = raw.replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s*[–-]\s*/);

  function parseShort(s: string, fallbackYear?: number): Date | null {
    s = s.trim();
    const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})(?:\s+(\d{2,4}))?$/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (month === undefined) return null;
    let year = m[3] ? parseInt(m[3], 10) : (fallbackYear ?? new Date().getFullYear());
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  if (parts.length >= 2) {
    const endDate = parseShort(parts[parts.length - 1]);
    if (!endDate) return { startAt: null, endAt: null };
    const startDate = parseShort(parts[0], endDate.getFullYear());
    return {
      startAt: startDate ? startDate.toISOString() : null,
      endAt: endDate.toISOString(),
    };
  }

  const single = parseDMY(clean) ?? parseShort(clean);
  return { startAt: single ? single.toISOString() : null, endAt: null };
}

async function scrapeSection(path: string): Promise<GasworksRawEvent[]> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Gasworks ${path} error: ${res.status}`);

  const $ = cheerio.load(await res.text());
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const events: GasworksRawEvent[] = [];

  $("#forthcoming article, #current article").each((_, el) => {
    (function (node: typeof el) {
      const $card = $(node);

      const titleEl = $card.find("h1 a").first();
      const title = titleEl.text().replace(/\s+/g, " ").trim();
      if (!title) return;

      const href = titleEl.attr("href") ?? "";
      const slug = href.replace(/^\//, "").replace(/\/$/, "");
      if (!slug) return;
      const url = `${BASE_URL}/${slug}`;

      const dateRaw = $card
        .find("h2.date span")
        .map((_, s) => $(s).text().trim())
        .get()
        .join(" ");
      const { startAt, endAt } = parseGasworksDate(dateRaw);

      const endDate = endAt ? new Date(endAt) : null;
      const startDate = startAt ? new Date(startAt) : null;
      const isVisible = endDate
        ? endDate >= now
        : startDate
          ? startDate >= sevenDaysAgo
          : false;
      if (!isVisible) return;

      const imgSrc = $card.find("img").first().attr("src") ?? null;
      const imageUrl = imgSrc
        ? imgSrc.startsWith("http") ? imgSrc : `${BASE_URL}${imgSrc}`
        : null;

      const description =
        $card
          .find("p.precis")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .replace(/\s*More$/, "")
          .trim() || null;

      events.push({
        slug,
        title,
        description,
        imageUrl,
        startAt,
        endAt,
        isFree: /\bfree\b/i.test($card.text()),
        url,
      });
    })(el);
  });

  return events;
}

export async function fetchGasworksEvents(): Promise<GasworksRawEvent[]> {
  const [exhibitions, eventsList] = await Promise.all([
    scrapeSection("/exhibitions/"),
    scrapeSection("/events/"),
  ]);
  const seen = new Map<string, GasworksRawEvent>();
  for (const e of [...exhibitions, ...eventsList]) seen.set(e.slug, e);
  return [...seen.values()];
}

export function normaliseGasworksEvent(raw: GasworksRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Gasworks event ${raw.slug} has no start date`);
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: {
      name: "Gasworks",
      sourceType: "gasworks",
      profileUrl: BASE_URL,
    },
    category: "gallery-exhibition",
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "gasworks", id: raw.slug, url: raw.url },
  };
}
