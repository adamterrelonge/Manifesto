import type { NormalisedEvent } from "@/lib/types";
import { REQUEST_HEADERS, parseDMY } from "./scrape-utils";

// Vardaxoglou Gallery, Soho. Squarespace-built; the `/exhibitions` page has
// no JSON-LD/`<time>` markup, but each "UserItemsListSimple" section embeds
// its own data as an HTML-entity-escaped JSON blob in a `data-current-
// context="{...}"` attribute — one block (~100KB) carries a `userItems[]`
// array of every exhibition, current back through the gallery's full
// history. Each item's `description` is 2-3 `<p>` tags: an optional
// "Forthcoming Exhibition" label, the artist name(s), then always a final
// `<p>` of "D Month – D Month YYYY<br>[Private View: ...<br>]Vardaxoglou,
// London" — the date range is always that last paragraph's first `<br>`-
// separated segment. Only the start side sometimes carries a year (a bare
// "1 – 22 September 2021" range has no year on the start day), so the end
// is parsed first and its year reused for the start, same shared-year
// fallback used elsewhere in this codebase (leicester-museums.ts).

const BASE_URL = "https://vardaxoglou.com";
const LISTING_URL = `${BASE_URL}/exhibitions`;

const VENUE = {
  name: "Vardaxoglou Gallery",
  address: "7 Royalty Mews, Dean Street",
  city: "London",
  region: "Greater London",
  postcode: "W1D 3AS",
  lat: 51.5139,
  lng: -0.1328,
};

const CONTEXT_ATTR_RE = /data-current-context="([^"]*)"/g;

interface RawUserItem {
  title?: string;
  description?: string;
  button?: { buttonLink?: string };
}

interface RawSectionContext {
  userItems?: RawUserItem[];
}

export interface VardaxoglouRawEvent {
  slug: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  url: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function slugFromLink(link: string): string {
  return link.replace(/^\/+|\/+$/g, "");
}

// "11 April – 7 June 2026" / "1 – 22 September 2021" / "21 November 2024 –
// 25 January 2025". The year only ever appears attached to a month on the
// end side (and sometimes the start side too) — never assumed on a bare
// leading day number.
function parseDateRange(text: string): { startAt: string | null; endAt: string | null } {
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

function extractItems(html: string): RawUserItem[] {
  const items: RawUserItem[] = [];
  let match: RegExpExecArray | null;
  CONTEXT_ATTR_RE.lastIndex = 0;

  while ((match = CONTEXT_ATTR_RE.exec(html)) !== null) {
    if (match[1].length < 1000) continue; // small unrelated data-current-context blocks

    let parsed: RawSectionContext;
    try {
      parsed = JSON.parse(decodeEntities(match[1])) as RawSectionContext;
    } catch {
      continue;
    }

    if (Array.isArray(parsed.userItems)) items.push(...parsed.userItems);
  }

  return items;
}

export async function fetchVardaxoglouEvents(): Promise<VardaxoglouRawEvent[]> {
  const res = await fetch(LISTING_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Vardaxoglou listing error: ${res.status} ${res.statusText}`);

  const items = extractItems(await res.text());
  const seen = new Set<string>();
  const events: VardaxoglouRawEvent[] = [];

  for (const item of items) {
    const link = item.button?.buttonLink;
    const title = item.title?.trim();
    if (!link || !title) continue;

    const slug = slugFromLink(link);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const paragraphs = (item.description ?? "").match(/<p[^>]*>([\s\S]*?)<\/p>/g) ?? [];
    if (paragraphs.length === 0) continue;
    const lastParagraph = paragraphs[paragraphs.length - 1];
    const lines = lastParagraph
      .replace(/^<p[^>]*>/, "")
      .replace(/<\/p>$/, "")
      .split(/<br\s*\/?>/i)
      .map((line) => line.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const { startAt, endAt } = parseDateRange(lines[0]);
    if (!startAt) continue;

    // Everything but the date/private-view/venue lines, if there's a
    // meaningful second paragraph (usually just the artist name(s), already
    // in the title) — left null rather than duplicating the title.
    const description = null;

    events.push({
      slug,
      title,
      description,
      startAt,
      endAt,
      url: `${BASE_URL}${link}`,
    });
  }

  return events;
}

export function normaliseVardaxoglouEvent(raw: VardaxoglouRawEvent): NormalisedEvent {
  return {
    title: raw.title,
    description: raw.description,
    startAt: raw.startAt,
    endAt: raw.endAt,
    venue: VENUE,
    organiser: { name: "Vardaxoglou Gallery", sourceType: "vardaxoglou", profileUrl: LISTING_URL },
    category: "gallery-exhibition",
    isFree: true,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: null,
    source: { provider: "vardaxoglou", id: raw.slug, url: raw.url },
  };
}
