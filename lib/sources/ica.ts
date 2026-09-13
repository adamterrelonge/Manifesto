import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY, applyTime, mapWithConcurrency } from "./scrape-utils";

const BASE_URL = "https://www.ica.art";
const DAYS_AHEAD = 14;
const DAY_FETCH_CONCURRENCY = 5;

const VENUE = {
  name: "ICA",
  address: "The Mall",
  city: "London",
  region: "Greater London",
  postcode: "SW1Y 5AH",
  lat: 51.5064,
  lng: -0.1304,
};

const PATH_CATEGORY: Record<string, Category> = {
  films: "film",
  live: "theatre-performance",
  talks: "workshop-talk",
  exhibitions: "gallery-exhibition",
};

// The site's talks/events section moved from /talks-and-events to /talks at
// some point after this adapter was first built — /talks-and-events now
// 404s outright, and the day-paginated crawl below was silently missing
// every talk and workshop as a result, including the ICA's own annual GLUE
// Book Fair (whose own page is /talks/glue-2026). Confirmed live: /films
// and /live paths are unchanged, only this one renamed.
const EVENT_HREF_RE = /^\/(films|live|talks)\/([^/?]+)/;

// /exhibitions is a separate flat listing, not day-paginated like
// films/live/talks-and-events above — a run like "Autumn Knight: I Can't
// Complain" (29 Sep - 29 Nov) would otherwise be invisible to the
// DAYS_AHEAD=14 day-page crawl until the show is already 2 weeks in.
const EXHIBITIONS_URL = `${BASE_URL}/exhibitions`;
const EXHIBITION_HREF_RE = /^\/exhibitions\/([^/?]+)/;

export interface IcaRawEvent {
  slug: string;
  section: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function buildDayUrls(): string[] {
  const urls: string[] = [];
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    urls.push(`${BASE_URL}/events/${yyyy}-${mm}-${dd}`);
  }
  return urls;
}

interface DayPageEvent {
  slug: string;
  section: string;
  title: string;
  imageUrl: string | null;
  timeText: string | null;
  isFree: boolean;
  url: string;
}

interface DayResult {
  date: Date;
  events: DayPageEvent[];
}

async function fetchDayPage(url: string): Promise<DayResult | null> {
  const dateMatch = url.match(/(\d{4})-(\d{2})-(\d{1,2})$/);
  if (!dateMatch) return null;
  const date = new Date(
    parseInt(dateMatch[1], 10),
    parseInt(dateMatch[2], 10) - 1,
    parseInt(dateMatch[3], 10)
  );

  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return null;

    const $ = cheerio.load(await res.text());
    const events: DayPageEvent[] = [];
    const seen = new Set<string>();

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const m = href.match(EVENT_HREF_RE);
      if (!m) return;

      const section = m[1];
      const slug = m[2];
      const key = `${section}/${slug}`;
      if (seen.has(key)) return;
      seen.add(key);

      const $card = $(el);
      // Card title lives in one or more `.title-container .title` <div>s
      // (never h2/h3/h4) — a film card carries two (a season/strand tag
      // first, e.g. "Off-Circuit", then the real title), a talks card
      // carries just one. The old h2/h3/h4 selector matched nothing here,
      // so it silently fell back to the whole card's dumped text (title +
      // time + description run together) for every single day-page event.
      const titleHtml = $card.find(".title-container .title").last().html() ?? "";
      const title =
        titleHtml
          .replace(/<\s*\/?\s*br\s*\/?\s*>/gi, ": ")
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim() || $card.find("h2, h3, h4").first().text().trim();
      if (!title) return;

      const imageEl = $card.find("img").first();
      let imageUrl = imageEl.attr("src") ?? imageEl.attr("data-src") ?? null;
      if (imageUrl?.startsWith("//")) imageUrl = `https:${imageUrl}`;

      // Same issue as the title: the time text sits directly inside
      // `.time-container` (plain text or a nested `.time-slot` div), never
      // inside a `p`/`span`/`time` tag, so the old selector always missed
      // it and every event silently defaulted to midnight.
      let timeText: string | null = null;
      const containerTimeText = $card.find(".time-container").first().text().trim();
      if (/\d{1,2}:\d{2}\s*[AP]M/i.test(containerTimeText)) {
        timeText = containerTimeText;
      } else {
        $card.find("p, span, time").each((_, p) => {
          if (timeText) return;
          const t = $(p).text().trim();
          if (/\d{1,2}:\d{2}\s*[AP]M/i.test(t)) timeText = t;
        });
      }

      const isFree = /\bfree\b/i.test($card.text());
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

      events.push({ slug, section, title, imageUrl, timeText, isFree, url: fullUrl });
    });

    return { date, events };
  } catch {
    return null;
  }
}

// "29 September – 29 November 2026" (full range), "15 – 20 September 2026"
// (day-only start, shared month/year), or "Mon, 28 September" (single date,
// no year). The year only ever appears on the end/single side, so it's
// always parsed first and reused for the start — same shared-year fallback
// used elsewhere in this codebase (leicester-museums.ts, nottingham-
// contemporary.ts) for exhibition ranges that don't repeat the year twice.
function parseIcaExhibitionDates(text: string): { startAt: string | null; endAt: string | null } {
  const clean = text.replace(/\s+/g, " ").trim();
  const dashMatch = clean.match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (!dashMatch) {
    const single = parseDMY(clean);
    return { startAt: single ? single.toISOString() : null, endAt: null };
  }

  const [, leftRaw, rightRaw] = dashMatch;
  const end = parseDMY(rightRaw);
  if (!end) return { startAt: null, endAt: null };

  const dayOnly = leftRaw.trim().match(/^(\d{1,2})$/);
  const start = dayOnly
    ? new Date(end.getFullYear(), end.getMonth(), parseInt(dayOnly[1], 10))
    : parseDMY(leftRaw, end.getFullYear());

  return { startAt: (start ?? end).toISOString(), endAt: end.toISOString() };
}

async function fetchIcaExhibitions(): Promise<IcaRawEvent[]> {
  const res = await fetch(EXHIBITIONS_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) return [];

  const $ = cheerio.load(await res.text());
  const events: IcaRawEvent[] = [];
  const seen = new Set<string>();

  $("div.item.exhibitions").each((_, el) => {
    const $card = $(el);
    const $link = $card.find("a[href]").first();
    const href = $link.attr("href") ?? "";
    const m = href.match(EXHIBITION_HREF_RE);
    if (!m) return;

    const slug = m[1];
    if (seen.has(slug)) return;
    seen.add(slug);

    // Titles can contain a `<br>` joining a series label to the real
    // title (e.g. "GLUE Book Fair Exhibition<br>Jesse Glazzard - ...") —
    // .text() alone would run the two halves together with no separator.
    const titleHtml = $card.find(".title-container .title").first().html() ?? "";
    const title = titleHtml
      .replace(/<br\s*\/?>/gi, ": ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!title) return;

    const dateText = $card.find(".date").first().text().trim();
    const { startAt, endAt } = parseIcaExhibitionDates(dateText);
    if (!startAt) return;

    const description =
      $card.find(".description").first().text().replace(/\s+/g, " ").trim() || null;

    let imageUrl = $card.find("img").first().attr("src") ?? null;
    if (imageUrl?.startsWith("//")) imageUrl = `https:${imageUrl}`;

    const isFree = /\bfree\b/i.test($card.text());
    const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;

    events.push({
      slug,
      section: "exhibitions",
      title,
      description,
      imageUrl,
      startAt,
      endAt,
      isFree,
      url: fullUrl,
    });
  });

  return events;
}

export async function fetchIcaEvents(): Promise<IcaRawEvent[]> {
  const dayUrls = buildDayUrls();
  const [dayResults, exhibitions] = await Promise.all([
    mapWithConcurrency(dayUrls, DAY_FETCH_CONCURRENCY, fetchDayPage),
    fetchIcaExhibitions().catch(() => [] as IcaRawEvent[]),
  ]);

  const seen = new Map<string, IcaRawEvent>();

  for (const result of dayResults) {
    if (!result) continue;
    const { date, events } = result;

    for (const ev of events) {
      const key = `${ev.section}/${ev.slug}`;
      if (seen.has(key)) continue;

      let startAt: string | null = null;
      if (ev.timeText) {
        startAt = applyTime(date, ev.timeText).toISOString();
      } else {
        startAt = date.toISOString();
      }

      seen.set(key, {
        slug: ev.slug,
        section: ev.section,
        title: ev.title,
        description: null,
        imageUrl: ev.imageUrl,
        startAt,
        endAt: null,
        isFree: ev.isFree,
        url: ev.url,
      });
    }
  }

  for (const ev of exhibitions) {
    const key = `${ev.section}/${ev.slug}`;
    if (!seen.has(key)) seen.set(key, ev);
  }

  return [...seen.values()];
}

export function normaliseIcaEvent(raw: IcaRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`ICA event ${raw.slug} has no start date`);

  const category: Category | null = PATH_CATEGORY[raw.section] ?? null;

  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "ICA", sourceType: "ica", profileUrl: BASE_URL },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "ica", id: `${raw.section}/${raw.slug}`, url: raw.url },
  };
}
