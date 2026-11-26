import type { NormalisedEvent, NormalisedVenue } from "@/lib/types";
import type { Category } from "@/lib/categories";
import { REQUEST_HEADERS, cheerio } from "./scrape-utils";

// The Events Calendar (WordPress plugin, "tribe") REST API —
// `/wp-json/tribe/events/v1/events`, public on every site that runs the
// plugin. One adapter, one config entry per site
// (lib/sources/platform-venues.ts). Field names confirmed live on Chats
// Palace, Housmans, The Stove and Wharf Chambers (2026-11-26).

export interface TribeRawVenue {
  venue?: string;
  address?: string;
  city?: string;
  zip?: string;
  geo_lat?: number | string;
  geo_lng?: number | string;
}

export interface TribeRawEvent {
  id: number;
  url: string;
  title: string;
  description?: string;
  image?: { url?: string } | false;
  utc_start_date: string; // "2026-11-26 19:30:00", UTC
  utc_end_date?: string;
  cost?: string;
  cost_details?: { values?: string[] };
  venue?: TribeRawVenue | unknown[];
  categories?: { name?: string }[];
}

interface TribeResponse {
  events?: TribeRawEvent[];
  next_rest_url?: string;
}

export interface TribeSiteConfig {
  /** events.source_provider, kebab-case. */
  provider: string;
  name: string;
  /** Site origin, e.g. https://chatspalace.com */
  siteUrl: string;
  /** Used when an event has no venue of its own. */
  venue: NormalisedVenue;
  category?: Category | null;
}

const WINDOW_DAYS = 8; // matches the public window (app/page.tsx)
const MAX_PAGES = 5;

export async function fetchTribeEvents(config: TribeSiteConfig, now: Date = new Date()): Promise<TribeRawEvent[]> {
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const url = new URL(`${config.siteUrl}/wp-json/tribe/events/v1/events`);
  url.searchParams.set("start_date", now.toISOString().slice(0, 10));
  url.searchParams.set("end_date", horizon.toISOString().slice(0, 10));
  url.searchParams.set("per_page", "50");

  const events: TribeRawEvent[] = [];
  let next: string | undefined = url.toString();
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const res = await fetch(next, { headers: REQUEST_HEADERS });
    if (!res.ok) throw new Error(`${config.name} events API error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as TribeResponse;
    events.push(...(data.events ?? []));
    next = data.next_rest_url;
  }
  return events;
}

function plainText(value: string | undefined): string | null {
  if (!value) return null;
  const text = cheerio.load(value).text().replace(/\s+/g, " ").trim();
  return text || null;
}

function utcIso(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(`${value.replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function toNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function eventVenue(raw: TribeRawEvent, fallback: NormalisedVenue): NormalisedVenue {
  const v = raw.venue;
  if (!v || Array.isArray(v) || !(v as TribeRawVenue).venue) return fallback;
  const venue = v as TribeRawVenue;
  const name = plainText(venue.venue) ?? fallback.name;
  if (name === fallback.name) return fallback;
  return {
    name,
    address: plainText(venue.address),
    city: plainText(venue.city),
    region: null,
    postcode: venue.zip?.trim() || null,
    lat: toNumber(venue.geo_lat),
    lng: toNumber(venue.geo_lng),
  };
}

export function normaliseTribeEvent(config: TribeSiteConfig, raw: TribeRawEvent): NormalisedEvent {
  const startAt = utcIso(raw.utc_start_date);
  if (!startAt) throw new Error(`${config.name} event ${raw.id} has no start date`);
  const endAt = utcIso(raw.utc_end_date);

  const prices = (raw.cost_details?.values ?? []).map(Number).filter(Number.isFinite);
  const priceMin = prices.length ? Math.min(...prices) : null;
  const priceMax = prices.length ? Math.max(...prices) : null;
  const saysFree = /^\s*free\s*$/i.test(plainText(raw.cost) ?? "");

  return {
    title: plainText(raw.title) ?? raw.title,
    description: plainText(raw.description),
    startAt,
    endAt: endAt && endAt > startAt ? endAt : null,
    venue: eventVenue(raw, config.venue),
    organiser: { name: config.name, sourceType: config.provider, profileUrl: config.siteUrl },
    category: config.category ?? null,
    isFree: priceMax === 0 || (prices.length === 0 && saysFree),
    priceMin: priceMin ?? (saysFree ? 0 : null),
    priceMax: priceMax ?? (saysFree ? 0 : null),
    currency: "GBP",
    imageUrl: (raw.image && raw.image.url) || null,
    source: { provider: config.provider, id: String(raw.id), url: raw.url || null },
  };
}
