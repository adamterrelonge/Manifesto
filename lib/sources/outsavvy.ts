import type { NormalisedEvent } from "@/lib/types";

// Field names reverse-engineered from https://partners.outsavvy.com/developer/
// (events/search, response/event, response/date) — there's no live partner
// token to confirm against a real payload yet, same caveat as
// lib/sources/skiddle.ts. Set OUTSAVVY_API_TOKEN and watch the [outsavvy]
// debug log below on the first real run to verify these before trusting them
// long-term.

const OUTSAVVY_API_BASE = "https://api.outsavvy.com/v1";

export interface OutsavvySearchParams {
  latitude?: number;
  longitude?: number;
  range?: number; // miles
  startDate?: string; // ISO date, "start_date"
  endDate?: string; // ISO date, "end_date"
  pageNumber?: number;
  pageSize?: number;
}

interface OutsavvyRawDate {
  id: string | number;
  timezone?: string;
  startlocal?: string;
  startutc?: string;
  endlocal?: string;
  endutc?: string;
  active?: boolean;
  event_date_description?: string | null;
}

interface OutsavvyRawEvent {
  id: string | number;
  name: string;
  description?: string | null;
  url?: string;
  dates?: OutsavvyRawDate[];
  organiser_id?: string | number;
  image_url?: string | null;
  image_url_large?: string | null;
  location_name?: string | null;
  address_1?: string | null;
  address_town?: string | null;
  address_postcode?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  price?: string | null;
  status?: string;
}

interface OutsavvySearchResponse {
  events?: OutsavvyRawEvent[];
  total_items?: number;
  page_number?: number;
  page_size?: number;
  total_pages?: number;
}

export async function fetchOutsavvyEvents(
  params: OutsavvySearchParams = {}
): Promise<OutsavvySearchResponse> {
  const token = process.env.OUTSAVVY_API_TOKEN;
  if (!token) {
    throw new Error("Missing OUTSAVVY_API_TOKEN environment variable");
  }

  const url = new URL(`${OUTSAVVY_API_BASE}/events/search`);
  if (params.latitude !== undefined) {
    url.searchParams.set("latitude", String(params.latitude));
  }
  if (params.longitude !== undefined) {
    url.searchParams.set("longitude", String(params.longitude));
  }
  if (params.range !== undefined) url.searchParams.set("range", String(params.range));
  if (params.startDate) url.searchParams.set("start_date", params.startDate);
  if (params.endDate) url.searchParams.set("end_date", params.endDate);
  url.searchParams.set("page_number", String(params.pageNumber ?? 1));
  url.searchParams.set("page_size", String(params.pageSize ?? 50));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Partner ${token}` },
  });

  if (!res.ok) {
    throw new Error(
      `Outsavvy API error: ${res.status} ${res.statusText} — ${await res.text()}`
    );
  }

  const data = (await res.json()) as OutsavvySearchResponse;

  if (process.env.NODE_ENV !== "production" && data.events?.[0]) {
    console.log(
      "[outsavvy] sample raw event (verify field names):",
      JSON.stringify(data.events[0], null, 2)
    );
  }

  return data;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The event-level `price` field is a free-text summary ("From £10",
// "Sold out", "Free"), not a clean numeric min/max like Skiddle's
// ticketpricing — only the unambiguous "free" case is trusted here rather
// than guessing at a currency symbol's meaning.
function parsePrice(price: string | null | undefined): {
  isFree: boolean;
  priceMin: number | null;
} {
  if (!price) return { isFree: false, priceMin: null };
  if (price.trim().toLowerCase() === "free") return { isFree: true, priceMin: 0 };
  const match = price.match(/[\d.]+/);
  return { isFree: false, priceMin: match ? Number(match[0]) : null };
}

export interface OutsavvyEventDate {
  event: OutsavvyRawEvent;
  date: OutsavvyRawDate;
}

// Outsavvy nests every showing of an event under its own `dates` array (e.g.
// a run of the same show across several nights) — flatten to one row per
// active date instance, the same one-row-per-showing shape Skiddle/
// Ticketmaster/Eventbrite already return; lib/group-events.ts re-groups
// these for display.
export function flattenOutsavvyEvents(
  events: OutsavvyRawEvent[]
): OutsavvyEventDate[] {
  const flattened: OutsavvyEventDate[] = [];
  for (const event of events) {
    for (const date of event.dates ?? []) {
      if (date.active === false) continue;
      flattened.push({ event, date });
    }
  }
  return flattened;
}

export function normaliseOutsavvyEvent({
  event,
  date,
}: OutsavvyEventDate): NormalisedEvent {
  const startAt = date.startutc ?? date.startlocal;
  if (!startAt) {
    throw new Error(`Outsavvy event ${event.id} date ${date.id} has no start time`);
  }
  const endAt = date.endutc ?? date.endlocal ?? null;

  const { isFree, priceMin } = parsePrice(event.price);

  return {
    title: event.name,
    description: event.description ?? null,
    startAt: new Date(startAt).toISOString(),
    endAt: endAt ? new Date(endAt).toISOString() : null,
    venue: event.location_name
      ? {
          name: event.location_name,
          address: event.address_1 ?? null,
          city: event.address_town ?? null,
          // Outsavvy has no region field at all (only town/postcode) — leave
          // null rather than pass the town through as a fake region, which
          // is exactly the bad-data shape the region cleanup pass fixed for
          // Skiddle/Eventbrite (see lib/uk-region.ts).
          region: null,
          postcode: event.address_postcode ?? null,
          lat: toNumber(event.latitude),
          lng: toNumber(event.longitude),
        }
      : null,
    organiser: null,
    // No category/genre field on Outsavvy events — leave unclassified
    // like Eventbrite rather than guess.
    category: null,
    isFree,
    priceMin,
    priceMax: null,
    currency: "GBP",
    imageUrl: event.image_url_large ?? event.image_url ?? null,
    source: {
      provider: "outsavvy",
      // One event can have several date instances — key on both so each
      // showing upserts as its own row instead of overwriting the last.
      id: `${event.id}-${date.id}`,
      url: event.url ?? null,
    },
  };
}
