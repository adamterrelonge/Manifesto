import type { NormalisedEvent } from "@/lib/types";
import {
  EVENTBRITE_ORGANISERS,
  type EventbriteOrganiser,
} from "@/lib/sources/eventbrite-organisers";
import { normaliseUkRegion } from "@/lib/uk-region";

// Eventbrite deprecated public event search (GET /v3/events/search/) in Dec
// 2019 — https://github.com/Automattic/eventbrite-api/issues/83 — and there
// is no location-based discovery endpoint anymore. The only remaining path
// to Eventbrite's public events is listing a known organiser's events, so
// unlike the Skiddle/Ticketmaster adapters this one works off the curated
// list in lib/sources/eventbrite-organisers.ts instead of a live search.
//
// Note: Eventbrite has two similarly-named resources — "organizers" (the
// public-facing brand/profile, whose numeric ID is what appears at the end
// of a public eventbrite.com/o/<name>-<id> URL) and "organizations" (the
// private account/team entity, only usable for orgs the token's own user
// belongs to). GET /v3/organizations/:id/events/ 404s for anyone else's
// public organiser — GET /v3/organizers/:id/events/ is the one that
// actually works for arbitrary public organisers. Confirmed live against
// Black Ballad's organizer id (11347103582), including expand=venue.

const EVENTBRITE_API_BASE = "https://www.eventbriteapi.com/v3";

interface EventbriteVenue {
  name?: string;
  address?: {
    address_1?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    latitude?: string;
    longitude?: string;
  };
}

interface EventbriteRawEvent {
  id: string;
  name?: { text?: string };
  description?: { text?: string };
  start?: { utc?: string };
  end?: { utc?: string };
  url?: string;
  is_free?: boolean;
  logo?: { url?: string };
  venue?: EventbriteVenue;
}

interface EventbriteEventsResponse {
  events?: EventbriteRawEvent[];
  pagination?: { has_more_items?: boolean; continuation?: string };
}

export async function fetchEventbriteOrganiserEvents(
  organiser: EventbriteOrganiser,
  continuation?: string
): Promise<EventbriteEventsResponse> {
  const token = process.env.EVENTBRITE_API_TOKEN;
  if (!token) {
    throw new Error("Missing EVENTBRITE_API_TOKEN environment variable");
  }

  const url = new URL(
    `${EVENTBRITE_API_BASE}/organizers/${organiser.id}/events/`
  );
  url.searchParams.set("status", "live");
  url.searchParams.set("order_by", "start_asc");
  url.searchParams.set("expand", "venue");
  if (continuation) url.searchParams.set("continuation", continuation);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(
      `Eventbrite API error for organiser ${organiser.id}: ${res.status} ${res.statusText} — ${await res.text()}`
    );
  }

  return (await res.json()) as EventbriteEventsResponse;
}

export interface EventbriteEventWithOrganiser {
  organiser: EventbriteOrganiser;
  event: EventbriteRawEvent;
}

export interface EventbriteFetchResult {
  events: EventbriteEventWithOrganiser[];
  // Per-organiser failures (bad/stale id, API error, etc). Previously a
  // single organiser throwing here aborted the whole function, silently
  // discarding every other organiser's events for the run — confirmed live
  // 2026-09-11 when one dead id (an org that had moved to a new Eventbrite
  // profile) zeroed out all ~93 organisers' worth of events, not just its
  // own. Each organiser's fetch is now isolated so one bad id degrades
  // gracefully instead of taking the entire source down.
  errors: string[];
}

export async function fetchAllEventbriteEvents(): Promise<EventbriteFetchResult> {
  const results: EventbriteEventWithOrganiser[] = [];
  const errors: string[] = [];

  for (const organiser of EVENTBRITE_ORGANISERS) {
    try {
      let continuation: string | undefined;
      do {
        const page = await fetchEventbriteOrganiserEvents(
          organiser,
          continuation
        );
        for (const event of page.events ?? []) {
          results.push({ organiser, event });
        }
        continuation = page.pagination?.has_more_items
          ? page.pagination.continuation
          : undefined;
      } while (continuation);
    } catch (err) {
      errors.push(`organiser ${organiser.name} (${organiser.id}): ${(err as Error).message}`);
    }
  }

  return { events: results, errors };
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normaliseEventbriteEvent(
  organiser: EventbriteOrganiser,
  raw: EventbriteRawEvent
): NormalisedEvent {
  const startAt = raw.start?.utc;
  if (!startAt) {
    throw new Error(`Eventbrite event ${raw.id} has no start date`);
  }

  return {
    title: raw.name?.text ?? "Untitled event",
    description: raw.description?.text ?? null,
    startAt: new Date(startAt).toISOString(),
    endAt: raw.end?.utc ? new Date(raw.end.utc).toISOString() : null,
    venue: raw.venue
      ? {
          name: raw.venue.name ?? "Unknown venue",
          address: raw.venue.address?.address_1 ?? null,
          city: raw.venue.address?.city ?? null,
          region: normaliseUkRegion(raw.venue.address?.region),
          postcode: raw.venue.address?.postal_code ?? null,
          lat: toNumber(raw.venue.address?.latitude),
          lng: toNumber(raw.venue.address?.longitude),
        }
      : null,
    organiser: {
      name: organiser.name,
      sourceType: "eventbrite",
      profileUrl: `https://www.eventbrite.com/o/${organiser.id}`,
    },
    // Eventbrite's category_id needs its own confirmed mapping table (like
    // SKIDDLE_CATEGORY_MAP/TICKETMASTER_*_MAP) before it can be trusted —
    // leave unclassified rather than guess at undocumented IDs.
    category: null,
    isFree: raw.is_free ?? false,
    // Ticket pricing isn't in the organization events list response — it
    // lives behind a separate per-event ticket_classes call, which would
    // multiply request volume by number of events. Leaving null for now
    // rather than adding an N+1 call per event.
    priceMin: null,
    priceMax: null,
    currency: "GBP",
    imageUrl: raw.logo?.url ?? null,
    source: {
      provider: "eventbrite",
      id: raw.id,
      url: raw.url ?? null,
    },
  };
}
