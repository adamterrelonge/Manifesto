import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, cheerio, mapWithConcurrency } from "./scrape-utils";

// Spektrix — the ticketing system behind many small UK theatres, arts
// centres and indie cinemas. Each client exposes a public, unauthenticated
// read API at `{ticket host}/{client}/api/v3` (the same endpoints their own
// websites call). One adapter, one config entry per venue
// (lib/sources/platform-venues.ts).
//
// Confirmed live (2026-11-26):
//   GET /events              every event with first/last instance (UTC)
//   GET /events/{id}/instances  each performance's start
// The `instanceStart_from` filters on /events are not honoured, so the
// window is applied here. No event carries a public URL (`webUrl` is empty
// everywhere), so events link to the venue's own what's-on page.

export interface SpektrixRawEvent {
  id: string;
  name: string;
  description?: string;
  htmlDescription?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  duration?: number; // minutes
  firstInstanceDateTimeUtc: string;
  lastInstanceDateTimeUtc: string;
  [attribute: `attribute_${string}`]: unknown;
}

interface SpektrixInstance {
  id: string;
  startUtc: string; // UTC, no zone suffix
}

export interface SpektrixVenueConfig {
  /** events.source_provider, kebab-case. */
  provider: string;
  name: string;
  /** `https://{ticket host}/{client}` — the API lives under /api/v3. */
  apiBase: string;
  whatsOnUrl: string;
  venue: NormalisedVenue;
  category?: Category | null;
  /** Venue-specific filter, e.g. one venue of a shared multi-venue account. */
  include?: (event: SpektrixRawEvent) => boolean;
}

/** An event plus the start of its next performance inside the window. */
export interface SpektrixWindowEvent {
  event: SpektrixRawEvent;
  startAt: string;
}

const WINDOW_DAYS = 8; // matches the public window (app/page.tsx)

// Spektrix sells extras as "events" — access add-ons, food and drink,
// packages, seats. None of these are something to go to.
const NOT_AN_EVENT =
  /\b(?:audio[- ]description (?:headsets?|add-?ons?)|captioning (?:facilities|service)|touch tours?|pre-?order|packages?|bundles?(?: deals)?|secure my booking|babies in arms|gift (?:cards?|vouchers?)|vouchers?|memberships?|donations?|dedicate a seat|add-?ons?|car park(?:ing)?|ice[- ]?cream|pizzas?|merchandise|co-?working)\b|\bprogrammes?\s*$|^\s*\*/i;

// Multi-week courses and termly classes — booked as a block, not something
// to drop into this week.
const COURSE = /\b(?:\d+[- ]weeks?|course|termly|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|20\d\d-\d\d)\b/i;

export function isSpektrixEventCandidate(event: SpektrixRawEvent): boolean {
  const name = event.name?.trim() ?? "";
  if (!name) return false;
  return !NOT_AN_EVENT.test(name) && !COURSE.test(name);
}

function utcMs(value: string): number {
  return Date.parse(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: REQUEST_HEADERS });
  if (!res.ok) throw new Error(`Spektrix ${url} error: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchSpektrixEvents(
  config: SpektrixVenueConfig,
  now: Date = new Date()
): Promise<SpektrixWindowEvent[]> {
  const from = now.getTime();
  const to = from + WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const all = await getJson<SpektrixRawEvent[]>(`${config.apiBase}/api/v3/events`);
  const inWindow = all.filter(
    (e) =>
      utcMs(e.lastInstanceDateTimeUtc) >= from &&
      utcMs(e.firstInstanceDateTimeUtc) <= to &&
      isSpektrixEventCandidate(e) &&
      (config.include ? config.include(e) : true)
  );

  const results = await mapWithConcurrency(inWindow, 4, async (event): Promise<SpektrixWindowEvent | null> => {
    const first = utcMs(event.firstInstanceDateTimeUtc);
    if (first >= from) return { event, startAt: new Date(first).toISOString() };
    // A run that started before today: find its next performance.
    const instances = await getJson<SpektrixInstance[]>(
      `${config.apiBase}/api/v3/events/${encodeURIComponent(event.id)}/instances`
    ).catch(() => [] as SpektrixInstance[]);
    const next = instances.map((i) => utcMs(i.startUtc)).filter((t) => t >= from && t <= to).sort((a, b) => a - b)[0];
    return next ? { event, startAt: new Date(next).toISOString() } : null;
  });
  return results.filter((r): r is SpektrixWindowEvent => r !== null);
}

function plainText(value: string | undefined): string | null {
  if (!value) return null;
  const text = cheerio.load(value).text().replace(/\s+/g, " ").trim();
  return text || null;
}

export function normaliseSpektrixEvent(
  config: SpektrixVenueConfig,
  { event, startAt }: SpektrixWindowEvent
): NormalisedEvent {
  const durationMs = (event.duration ?? 0) * 60 * 1000;
  const last = utcMs(event.lastInstanceDateTimeUtc);
  const endMs = Math.max(last, Date.parse(startAt)) + durationMs;

  return {
    title: event.name.replace(/\s+/g, " ").trim(),
    description: plainText(event.description) ?? plainText(event.htmlDescription),
    startAt,
    endAt: endMs > Date.parse(startAt) ? new Date(endMs).toISOString() : null,
    venue: config.venue,
    organiser: { name: config.name, sourceType: config.provider, profileUrl: config.whatsOnUrl },
    category: config.category ?? null,
    isFree: false,
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: event.imageUrl || event.thumbnailUrl || null,
    source: { provider: config.provider, id: event.id, url: config.whatsOnUrl },
  };
}
