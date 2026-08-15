import * as cheerio from "cheerio";
import type { NormalisedEvent } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, parseDMY, mapWithConcurrency } from "./scrape-utils";

const BASE_URL = "https://ibraaz.org";
const LISTING_URL = `${BASE_URL}/whats-on`;
const DETAIL_FETCH_CONCURRENCY = 4;

const VENUE = {
  name: "Ibraaz",
  address: "93 Mortimer Street",
  city: "London",
  region: "Greater London",
  postcode: "W1W 7SS",
  lat: 51.518,
  lng: -0.1408,
};

const TAG_CATEGORY: Record<string, Category> = {
  exhibition: "gallery-exhibition",
  "library-in-residence": "gallery-exhibition",
  film: "film",
  workshop: "workshop-talk",
  talk: "workshop-talk",
  performance: "theatre-performance",
  music: "music",
};

export interface IbraazRawEvent {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  tag: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  isFree: boolean;
  url: string;
}

function slugFromHref(href: string): string {
  return href.replace(/^\/whats-on\//, "").replace(/^\/+|\/+$/g, "");
}

// Card dates render as "16 Oct – 6 Sept 2026" (exhibitions/residencies) or
// "Sunday 16 Aug, 3–5pm" (single-day talks/screenings). The <time
// datetime="..."> attribute already carries an authoritative ISO start, so
// this only needs to recover a genuine end *date* from the text — the
// time-of-day case has no month name on the right of the dash and correctly
// falls through to null.
function parseEndDate(text: string, startYear: number): string | null {
  const parts = text.split(/\s*[–—-]\s*/);
  if (parts.length < 2) return null;
  const yearMatch = text.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : startYear;
  const end = parseDMY(parts[1], year);
  return end ? end.toISOString() : null;
}

interface ListingCard {
  slug: string;
  title: string;
  subtitle: string | null;
  tag: string | null;
  imageUrl: string | null;
  startAt: string | null;
  endAt: string | null;
  url: string;
}

// Every card — featured or not — is an <article class="card">:
//   <article class="card">
//     <a class="card__media" href="/whats-on/SLUG"><img data-nuxt-img src="..."></a>
//     <ul class="card__info"><li><div class="tag tag--invert">Featured</div></li>
//                            <li><div class="tag tag--themed">Film</div></li></ul>
//     <hgroup class="card__title">
//       <h3><a href="/whats-on/SLUG" class="title">Title</a></h3>
//       <p class="line line--bold">Subtitle / artist name</p>
//     </hgroup>
//     <time datetime="2026-08-16T14:00:00+00:00" class="card__dates">16 Oct – 6 Sept 2026</time>
//   </article>
// The "Featured" pill shares the same .tag class as the real category tag,
// so it has to be filtered out by text rather than by a distinct selector.
function parseListingPage(html: string): ListingCard[] {
  const $ = cheerio.load(html);
  const cards: ListingCard[] = [];
  const seen = new Set<string>();

  $("article.card").each((_, el) => {
    const $card = $(el);

    const $titleLink = $card.find(".card__title h3 a.title").first();
    const href = $titleLink.attr("href") ?? "";
    if (!href) return;
    const slug = slugFromHref(href);
    if (!slug || seen.has(slug)) return;
    seen.add(slug);

    const title = $titleLink.text().replace(/\s+/g, " ").trim();
    if (!title) return;

    const subtitle = $card.find(".card__title p.line").first().text().trim() || null;

    const tag =
      $card
        .find(".card__info .tag")
        .filter((_, t) => $(t).text().trim().toLowerCase() !== "featured")
        .first()
        .text()
        .trim() || null;

    const imageUrl = $card.find("img[data-nuxt-img]").first().attr("src") ?? null;

    const $time = $card.find("time.card__dates").first();
    const datetime = $time.attr("datetime");
    const dateText = $time.text().replace(/\s+/g, " ").trim();

    const startAt = datetime ? new Date(datetime).toISOString() : null;
    const endAt = startAt ? parseEndDate(dateText, new Date(startAt).getFullYear()) : null;

    cards.push({ slug, title, subtitle, tag, imageUrl, startAt, endAt, url: `${BASE_URL}${href}` });
  });

  return cards;
}

interface DetailInfo {
  description: string | null;
  isFree: boolean;
}

// Description paragraphs live in the first richtext block of the detail
// page. Ticketed talks/screenings embed a Ticket Tailor booking widget
// (`.tt-widget`); exhibitions and residencies, which are free to visit, have
// no booking widget at all — that presence/absence is a reliable proxy for
// isFree since no price is ever exposed in the static HTML (the widget's
// price list is rendered client-side by Ticket Tailor's own script).
async function fetchDetail(url: string): Promise<DetailInfo> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS });
    if (!res.ok) return { description: null, isFree: true };

    const html = await res.text();
    const $ = cheerio.load(html);

    const description =
      $(".split-clean__head .richtext p")
        .map((_, p) => $(p).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean)
        .join("\n\n") || null;

    const isFree = !html.includes("tt-widget");

    return { description, isFree };
  } catch {
    return { description: null, isFree: true };
  }
}

export async function fetchIbraazEvents(): Promise<IbraazRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Ibraaz listing error: ${res.status} ${res.statusText}`);

  const cards = parseListingPage(await res.text());
  const details = await mapWithConcurrency(cards, DETAIL_FETCH_CONCURRENCY, (c) => fetchDetail(c.url));

  return cards.map((c, i) => ({
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    description: details[i].description,
    tag: c.tag,
    imageUrl: c.imageUrl,
    startAt: c.startAt,
    endAt: c.endAt,
    isFree: details[i].isFree,
    url: c.url,
  }));
}

export function normaliseIbraazEvent(raw: IbraazRawEvent): NormalisedEvent {
  if (!raw.startAt) throw new Error(`Ibraaz event ${raw.slug} has no start date`);

  const category: Category | null = raw.tag ? TAG_CATEGORY[raw.tag.toLowerCase()] ?? null : null;

  return {
    title: raw.title,
    description: raw.description ?? raw.subtitle,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Ibraaz", sourceType: "ibraaz", profileUrl: LISTING_URL },
    category,
    isFree: raw.isFree,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.imageUrl,
    source: { provider: "ibraaz", id: raw.slug, url: raw.url },
  };
}
