import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidBearerSecret } from "@/lib/auth";
import { upsertNormalisedEvent } from "@/lib/ingest";
import { runExpiry, runDedup, runClassification, runQualityScoring } from "@/lib/pipeline";
import { fetchBarbicanEvents, normaliseBarbicanEvent } from "@/lib/sources/barbican";
import {
  fetchAllEventbriteEvents,
  normaliseEventbriteEvent,
} from "@/lib/sources/eventbrite";
import { EVENTBRITE_ORGANISERS } from "@/lib/sources/eventbrite-organisers";
import { fetchSkiddleEvents, normaliseSkiddleEvent } from "@/lib/sources/skiddle";
import {
  fetchTicketmasterEvents,
  normaliseTicketmasterEvent,
} from "@/lib/sources/ticketmaster";

// Single entry point for the whole pipeline: fetch every source, then
// dedup/classify/score the result. This replaces what used to be four
// separate per-source routes plus three separately-triggered pipeline
// stages that had to be called by hand, in the right order, after every
// ingest — a newly ingested event was invisible on the site until someone
// remembered to run all of them (see docs/PROJECT_PLAN.md Phase 3). The
// individual /api/ingest/*, /api/dedup, /api/classify, /api/quality routes
// were removed in favour of this one, except dedup/classify/quality which
// stay reachable standalone too for re-running just one stage.
export const dynamic = "force-dynamic";

type AdminClient = ReturnType<typeof createAdminClient>;

interface SourceResult {
  fetched: number;
  upserted: number;
  errors: string[];
}

async function ingestBarbican(admin: AdminClient): Promise<SourceResult> {
  const raw = await fetchBarbicanEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const event of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseBarbicanEvent(event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestEventbrite(admin: AdminClient): Promise<SourceResult> {
  if (EVENTBRITE_ORGANISERS.length === 0) {
    return {
      fetched: 0,
      upserted: 0,
      errors: [
        "EVENTBRITE_ORGANISERS is empty — add curated organiser IDs in lib/sources/eventbrite-organisers.ts",
      ],
    };
  }

  const raw = await fetchAllEventbriteEvents();
  let upserted = 0;
  const errors: string[] = [];
  for (const { organiser, event } of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseEventbriteEvent(organiser, event));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${event.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestSkiddle(admin: AdminClient): Promise<SourceResult> {
  // Skiddle's default `order` isn't date-ascending and a single page only
  // returns ~100 events by whatever that default ranking is — bounding to
  // the app's actual date window (matches app/page.tsx) and paginating a
  // few pages gets much fuller coverage of the week.
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 8);
  const minDate = today.toISOString().slice(0, 10);
  const maxDate = horizon.toISOString().slice(0, 10);

  type SkiddleEvent = Awaited<ReturnType<typeof fetchSkiddleEvents>>[number];
  const raw: SkiddleEvent[] = [];
  const MAX_PAGES = 3;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchSkiddleEvents({ minDate, maxDate, offset: page * 100 });
    raw.push(...batch);
    if (batch.length < 100) break;
  }

  let upserted = 0;
  const errors: string[] = [];
  for (const rawEvent of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseSkiddleEvent(rawEvent));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${rawEvent.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

async function ingestTicketmaster(admin: AdminClient): Promise<SourceResult> {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 8);
  const startDateTime = `${today.toISOString().split(".")[0]}Z`;
  const endDateTime = `${horizon.toISOString().split(".")[0]}Z`;

  type TicketmasterEventItem = Awaited<ReturnType<typeof fetchTicketmasterEvents>>[number];
  const raw: TicketmasterEventItem[] = [];
  const MAX_PAGES = 2;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchTicketmasterEvents({ startDateTime, endDateTime, page });
    raw.push(...batch);
    if (batch.length < 200) break;
  }

  let upserted = 0;
  const errors: string[] = [];
  for (const rawEvent of raw) {
    try {
      await upsertNormalisedEvent(admin, normaliseTicketmasterEvent(rawEvent));
      upserted += 1;
    } catch (err) {
      errors.push(`event ${rawEvent.id}: ${(err as Error).message}`);
    }
  }
  return { fetched: raw.length, upserted, errors };
}

// A whole source failing to fetch (bad API key, site redesign, network
// blip) must not take the other three down with it — each is isolated here
// rather than letting one thrown error abort the whole Promise.all.
async function runSource(name: string, fn: () => Promise<SourceResult>): Promise<SourceResult> {
  try {
    return await fn();
  } catch (err) {
    return { fetched: 0, upserted: 0, errors: [`${name} fetch failed: ${(err as Error).message}`] };
  }
}

export async function GET(request: NextRequest) {
  if (!isValidBearerSecret(request.headers.get("authorization"), process.env.INGEST_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const [barbican, eventbrite, skiddle, ticketmaster] = await Promise.all([
    runSource("barbican", () => ingestBarbican(admin)),
    runSource("eventbrite", () => ingestEventbrite(admin)),
    runSource("skiddle", () => ingestSkiddle(admin)),
    runSource("ticketmaster", () => ingestTicketmaster(admin)),
  ]);

  // Sequential and isolated from here: expire first so dedup/classify/
  // quality don't waste work on rows that will never be shown again, then
  // dedup before classify/quality so merged venues improve dedup's own
  // event-matching — each stage's failure is reported rather than aborting
  // the ones after it.
  let expiry: Awaited<ReturnType<typeof runExpiry>> | { error: string };
  try {
    expiry = await runExpiry(admin);
  } catch (err) {
    expiry = { error: (err as Error).message };
  }

  let dedup: Awaited<ReturnType<typeof runDedup>> | { error: string };
  try {
    dedup = await runDedup(admin);
  } catch (err) {
    dedup = { error: (err as Error).message };
  }

  let classify: Awaited<ReturnType<typeof runClassification>> | { error: string };
  try {
    classify = await runClassification(admin);
  } catch (err) {
    classify = { error: (err as Error).message };
  }

  let quality: Awaited<ReturnType<typeof runQualityScoring>> | { error: string };
  try {
    quality = await runQualityScoring(admin);
  } catch (err) {
    quality = { error: (err as Error).message };
  }

  return NextResponse.json({
    sources: { barbican, eventbrite, skiddle, ticketmaster },
    expiry,
    dedup,
    classify,
    quality,
  });
}
